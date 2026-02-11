/**
 * 🚀 EmbeddingQueue — Central embedding task scheduler
 *
 * Instead of each file calling embed() directly, files push tasks here.
 * The queue aggregates chunks into optimal batches, controls concurrency,
 * and provides real-time stats for the CLI UI layer.
 *
 * Architecture:
 *   push({ fileId, path, chunks }) → queue
 *   worker loop: dequeue → batch → embed → store → callback
 *
 * Key properties:
 *   - Global concurrency control (won't overwhelm Ollama)
 *   - Batch aggregation (groups small files into single requests)
 *   - Adaptive: batch size tuned to Ollama's throughput
 *   - Observable: emits stats for live CLI progress
 */

import { randomUUID } from "crypto";
import nodePath from "path";
import type { EmbeddingService } from "./embedding.service.js";
import type { VectorRepository } from "../repositories/vector.repository.js";
import type { Chunk } from "./chunker.js";

// ─── Types ───────────────────────────────────────────────────

export interface EmbedTask {
    fileId: string;
    path: string;
    fileName: string;
    chunks: Chunk[];
}

export interface QueueStats {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    totalChunksEmbedded: number;
    totalBatchesSent: number;
    avgBatchLatencyMs: number;
    avgChunkLatencyMs: number;
    elapsedMs: number;
}

export interface QueueCallbacks {
    onFileQueued?: (fileName: string, chunkCount: number) => void;
    onFileEmbedded?: (fileName: string, chunkCount: number, latencyMs: number) => void;
    onFileError?: (fileName: string, error: string) => void;
    onBatchSent?: (batchSize: number, latencyMs: number) => void;
    onDrain?: (stats: QueueStats) => void;
}

interface QueueOptions {
    /**
     * Max files being embedded in parallel.
     * Each file becomes 1 batch request (all its chunks in one /api/embed call).
     * Keep low (2-3) — Ollama handles one batch at a time anyway.
     */
    concurrency?: number;
    callbacks?: QueueCallbacks;
}


// ─── Queue Implementation ────────────────────────────────────

export class EmbeddingQueue {
    private queue: EmbedTask[] = [];
    private processing = 0;
    private completedCount = 0;
    private failedCount = 0;
    private totalChunksEmbedded = 0;
    private totalBatchesSent = 0;
    private totalBatchLatencyMs = 0;
    private startTime = 0;

    private readonly concurrency: number;
    private readonly callbacks: QueueCallbacks;
    private readonly embeddingService: EmbeddingService;
    private readonly vectorRepo: VectorRepository;

    private drainResolvers: Array<() => void> = [];

    constructor(
        embeddingService: EmbeddingService,
        vectorRepo: VectorRepository,
        options: QueueOptions = {}
    ) {
        this.embeddingService = embeddingService;
        this.vectorRepo = vectorRepo;
        this.concurrency = options.concurrency ?? 2;
        this.callbacks = options.callbacks ?? {};
    }


    // ─── Public API ──────────────────────────────────────────

    /**
     * Push a file's chunks into the queue for embedding.
     * The queue immediately starts processing if workers are available.
     */
    push(task: EmbedTask): void {
        if (this.startTime === 0) this.startTime = Date.now();

        this.queue.push(task);
        this.callbacks.onFileQueued?.(task.fileName, task.chunks.length);
        this._tick();
    }

    /**
     * Push multiple tasks at once (e.g., after scan phase completes).
     */
    pushAll(tasks: EmbedTask[]): void {
        for (const task of tasks) {
            this.push(task);
        }
    }

    /**
     * Returns a promise that resolves when all queued tasks are complete.
     */
    async drain(): Promise<QueueStats> {
        if (this.queue.length === 0 && this.processing === 0) {
            return this.getStats();
        }

        return new Promise<QueueStats>((resolve) => {
            this.drainResolvers.push(() => resolve(this.getStats()));
        });
    }

    /**
     * Get current queue statistics.
     */
    getStats(): QueueStats {
        return {
            queued: this.queue.length,
            processing: this.processing,
            completed: this.completedCount,
            failed: this.failedCount,
            totalChunksEmbedded: this.totalChunksEmbedded,
            totalBatchesSent: this.totalBatchesSent,
            avgBatchLatencyMs: this.totalBatchesSent > 0
                ? this.totalBatchLatencyMs / this.totalBatchesSent
                : 0,
            avgChunkLatencyMs: this.totalChunksEmbedded > 0
                ? this.totalBatchLatencyMs / this.totalChunksEmbedded
                : 0,
            elapsedMs: this.startTime > 0 ? Date.now() - this.startTime : 0,
        };
    }


    // ─── Internal Worker Loop ────────────────────────────────

    private _tick(): void {
        while (this.processing < this.concurrency && this.queue.length > 0) {
            const task = this.queue.shift()!;
            this.processing++;
            this._processTask(task).finally(() => {
                this.processing--;
                this._checkDrain();
                this._tick(); // continue processing
            });
        }
    }

    private async _processTask(task: EmbedTask): Promise<void> {
        const { fileId, path, fileName, chunks } = task;

        try {
            // Prepare texts with file context
            const texts = chunks.map(c => `[File: ${fileName}]\n${c.text}`);

            // Embed — single batch request for all chunks in this file
            const batchStart = Date.now();
            const embeddings = await this.embeddingService.embedBatch(texts);
            const batchLatency = Date.now() - batchStart;

            this.totalBatchesSent++;
            this.totalBatchLatencyMs += batchLatency;
            this.totalChunksEmbedded += chunks.length;
            this.callbacks.onBatchSent?.(chunks.length, batchLatency);

            // Build vector rows
            const rows = chunks.map((chunk, i) => ({
                id: randomUUID(),
                file_id: fileId,
                path,
                chunk_index: chunk.index,
                chunk_text: chunk.text,
                embedding: embeddings[i]!,
                start_line: chunk.startLine,
                end_line: chunk.endLine,
                language: "text",
            }));

            // Store in LanceDB
            await this.vectorRepo.insert(rows);

            this.completedCount++;
            this.callbacks.onFileEmbedded?.(fileName, chunks.length, batchLatency);
        } catch (err) {
            this.failedCount++;
            this.callbacks.onFileError?.(fileName, (err as Error).message);
        }
    }

    private _checkDrain(): void {
        if (this.queue.length === 0 && this.processing === 0) {
            const stats = this.getStats();
            this.callbacks.onDrain?.(stats);

            for (const resolve of this.drainResolvers) {
                resolve();
            }
            this.drainResolvers = [];
        }
    }
}

