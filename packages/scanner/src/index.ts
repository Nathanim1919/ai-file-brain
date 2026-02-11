import fs from "fs/promises";
import { walkDirectory } from "./walker.js";
import { extractMetadata } from "./metadata.js";
import pLimit from "p-limit";
import { db, upsertFile } from "../../../data/sqlite/db.js";
import type { IngestionService } from "../../ai/ingestionService.js";

const SCAN_CONCURRENCY = 10;   // IO-bound: read files + extract metadata
const EMBED_CONCURRENCY = 3;   // GPU-bound: Ollama batch embedding

// ─── Event callbacks the CLI layer can subscribe to ────────
export interface ScanCallbacks {
    // Phase 1: Discovery
    onDiscoveryStart?: (dir: string) => void;
    onDiscoveryEnd?: (dir: string, fileCount: number) => void;

    // Phase 1: Scanning (metadata extraction + SQLite)
    onFileScanned?: (name: string, index: number, total: number) => void;
    onScanPhaseComplete?: (totalFiles: number) => void;

    // Phase 2: Embedding
    onEmbedPhaseStart?: (totalFiles: number) => void;
    onFileEmbedded?: (name: string, index: number, total: number, chunkCount: number) => void;
    onEmbedError?: (name: string, error: string) => void;
    onEmbedPhaseComplete?: (embeddedFiles: number, errors: number) => void;

    // Overall
    onComplete?: (stats: ScanStats) => void;
}

export interface ScanStats {
    totalFiles: number;
    scannedFiles: number;
    embeddedFiles: number;
    skippedFiles: number;
    errors: number;
    durationMs: number;
    scanDurationMs: number;
    embedDurationMs: number;
}

export interface ScannedFile {
    name: string;
    path: string;
    fileId: string;
    content: string;
    size: number;
    type: string;
}

interface ScanOptions {
    ingestionService?: IngestionService;
    callbacks?: ScanCallbacks;
}

export const runScanner = async (options: ScanOptions = {}) => {
    const totalStart = Date.now();
    const cb = options.callbacks ?? {};

    const config = JSON.parse(
        await fs.readFile("config.json", "utf-8")
    );

    const walkOptions = {
        allowedExtensions: config.allowedExtensions || [],
        ignoredDirs: config.ignoredDirs || [],
        ignoredFiles: config.ignoredFiles || [],
        projectMarkerFiles: config.projectMarkerFiles || [],
    };

    // ═══════════════════════════════════════════════════════════
    //  PHASE 1: Discovery + Metadata Extraction + SQLite Storage
    // ═══════════════════════════════════════════════════════════
    const scanStart = Date.now();
    const scanLimit = pLimit(SCAN_CONCURRENCY);
    const scannedFiles: ScannedFile[] = [];

    for (const dir of config.allowedPaths) {
        cb.onDiscoveryStart?.(dir);

        const files = await walkDirectory(dir, walkOptions);
        cb.onDiscoveryEnd?.(dir, files.length);

        const total = files.length;
        let processed = 0;

        const metadataResults = await Promise.all(
            files.map((file) => scanLimit(async () => {
                const metadata = await extractMetadata(file);
                upsertFile(metadata);

                processed++;
                cb.onFileScanned?.(metadata.name, processed, total);

                // Collect files that have extractable content for Phase 2
                if (metadata.content.length > 0) {
                    const row = db.prepare("SELECT id FROM FILES WHERE path = ?").get(metadata.path) as { id: number } | undefined;
                    const fileId = row ? String(row.id) : metadata.path;

                    scannedFiles.push({
                        name: metadata.name,
                        path: metadata.path,
                        fileId,
                        content: metadata.content,
                        size: metadata.size,
                        type: metadata.type,
                    });
                }

                return metadata;
            }))
        );
    }

    const scanDurationMs = Date.now() - scanStart;
    cb.onScanPhaseComplete?.(scannedFiles.length);

    // ═══════════════════════════════════════════════════════════
    //  PHASE 2: Embedding (independent, resumable, throttled)
    // ═══════════════════════════════════════════════════════════
    const embedStart = Date.now();
    let embeddedCount = 0;
    let errorCount = 0;

    if (options.ingestionService && scannedFiles.length > 0) {
        cb.onEmbedPhaseStart?.(scannedFiles.length);

        const embedLimit = pLimit(EMBED_CONCURRENCY);
        const total = scannedFiles.length;

        await Promise.all(
            scannedFiles.map((file) => embedLimit(async () => {
                try {
                    await options.ingestionService!.ingestDocument(
                        file.fileId,
                        file.path,
                        file.content
                    );
                    embeddedCount++;
                    cb.onFileEmbedded?.(file.name, embeddedCount, total, 0);
                } catch (err) {
                    errorCount++;
                    cb.onEmbedError?.(file.name, (err as Error).message);
                }
            }))
        );

        cb.onEmbedPhaseComplete?.(embeddedCount, errorCount);
    }

    const embedDurationMs = Date.now() - embedStart;

    // ═══════════════════════════════════════════════════════════
    //  Summary
    // ═══════════════════════════════════════════════════════════
    const stats: ScanStats = {
        totalFiles: scannedFiles.length,
        scannedFiles: scannedFiles.length,
        embeddedFiles: embeddedCount,
        skippedFiles: scannedFiles.length - embeddedCount - errorCount,
        errors: errorCount,
        durationMs: Date.now() - totalStart,
        scanDurationMs,
        embedDurationMs,
    };

    cb.onComplete?.(stats);

    return scannedFiles;
};
