import { runScanner } from "../../../../packages/scanner/src/index.js";
import { EmbeddingService } from "../../../../packages/ai/embedding.service.js";
import { EmbeddingQueue } from "../../../../packages/ai/embeddingQueue.js";
import { VectorRepository } from "../../../../packages/repositories/vector.repository.js";
import { chunkText } from "../../../../packages/ai/chunker.js";
import { clearAllFiles } from "../../../../packages/db/index.js";
import {
    banner, brand, accent, success, warning, error, dim, muted, highlight,
    icons, line, summaryBox, sectionHeader,
    spin, ProgressBar,
} from "../../../../packages/cli-ui/index.js";
import type { ScanCallbacks, ScanStats } from "../../../../packages/scanner/src/index.js";

interface ScanFlags {
    fresh?: boolean;
}

export const handleScan = async (flags: ScanFlags = {}) => {
    banner();
    console.log(`  ${icons.scan} ${highlight("Scanner")} ${dim("— indexing your files with AI")}\n`);

    // ─── Initialize services ──────────────────────────────────
    const initSpinner = spin("Initializing AI services...");

    const embeddingService = new EmbeddingService();
    const vectorRepo = new VectorRepository();
    await vectorRepo.init();

    initSpinner.succeed("AI services ready");

    // ─── Fresh mode — wipe everything ─────────────────────────
    if (flags.fresh) {
        const clearSpinner = spin("Clearing all indexes (fresh mode)...");
        clearAllFiles();
        await vectorRepo.reset();
        clearSpinner.succeed("All indexes cleared — starting fresh");
    }

    // ═══════════════════════════════════════════════════════════
    //  PHASE 1: Discovery + Metadata Scan
    // ═══════════════════════════════════════════════════════════
    let scanProgress: ProgressBar | null = null;
    let totalDiscovered = 0;

    const callbacks: ScanCallbacks = {
        onDiscoveryStart(dir) {
            console.log(`\n  ${icons.folder} ${accent("Discovering files in")} ${dim(dir)}`);
        },

        onDiscoveryEnd(_dir, fileCount) {
            totalDiscovered += fileCount;
            console.log(`  ${icons.file} ${highlight(String(fileCount))} ${muted("files found")}\n`);

            scanProgress = new ProgressBar(fileCount, {
                label: "Scanning",
                showSpeed: true,
            });
        },

        onFileScanned(_name, _index, _total) {
            scanProgress?.increment();
        },

        onScanPhaseComplete(totalFiles) {
            console.log(`\n  ${icons.check} ${success("Scan phase complete")} — ${highlight(String(totalFiles))} ${muted("files with embeddable content")}`);
        },
    };

    const scanStart = Date.now();

    // Run Phase 1 only (no ingestionService passed — just scan + SQLite)
    const scannedFiles = await runScanner({ callbacks });
    const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);

    if (scannedFiles.length === 0) {
        console.log(`\n  ${icons.warn} ${warning("No embeddable files found.")} Check your config.json paths.`);
        return;
    }

    // ═══════════════════════════════════════════════════════════
    //  PHASE 2: AI Embedding (via EmbeddingQueue)
    // ═══════════════════════════════════════════════════════════
    console.log(`\n  ${icons.embed} ${highlight("Embedding Phase")} ${dim("— sending chunks to Ollama")}`);

    let embedProgress: ProgressBar | null = null;
    let embeddedCount = 0;
    let embedErrorCount = 0;

    const queue = new EmbeddingQueue(embeddingService, vectorRepo, {
        concurrency: 2,
        callbacks: {
            onFileEmbedded(fileName, chunkCount, latencyMs) {
                embeddedCount++;
                embedProgress?.increment({
                    speed: `${latencyMs}ms`,
                });
            },
            onFileError(fileName, err) {
                embedErrorCount++;
                embedProgress?.increment();
            },
            onDrain(stats) {
                // Queue fully drained — embedding complete
            },
        },
    });

    // Chunk all files and push to queue
    const tasks = scannedFiles.map(file => {
        const chunks = chunkText(file.content);
        const fileName = file.name.replace(/\.[^.]+$/, ""); // strip extension
        return {
            fileId: file.fileId,
            path: file.path,
            fileName,
            chunks,
        };
    }).filter(t => t.chunks.length > 0);

    const totalChunks = tasks.reduce((sum, t) => sum + t.chunks.length, 0);

    console.log(`  ${icons.chunk} ${highlight(String(totalChunks))} ${muted("chunks from")} ${highlight(String(tasks.length))} ${muted("files")}\n`);

    embedProgress = new ProgressBar(tasks.length, {
        label: "Embedding",
        showSpeed: true,
        showETA: true,
    });

    const embedStart = Date.now();

    // Push all tasks — queue processes with controlled concurrency
    queue.pushAll(tasks);

    // Wait for all embeddings to complete
    const queueStats = await queue.drain();
    const embedDuration = ((Date.now() - embedStart) / 1000).toFixed(1);

    // ═══════════════════════════════════════════════════════════
    //  Summary
    // ═══════════════════════════════════════════════════════════
    const totalDuration = ((Date.now() - scanStart) / 1000).toFixed(1);

    console.log();
    console.log(`  ${icons.sparkle} ${success("Scan complete")}${flags.fresh ? dim(" (fresh)") : ""}`);

    summaryBox([
        { label: "Files discovered:", value: totalDiscovered,                     icon: icons.file },
        { label: "Files embedded:",   value: embeddedCount,                       icon: icons.embed },
        { label: "Total chunks:",     value: totalChunks,                         icon: icons.chunk },
        { label: "Errors:",           value: embedErrorCount,                     icon: embedErrorCount > 0 ? icons.warn : icons.check },
        { label: "Scan phase:",       value: `${scanDuration}s`,                  icon: icons.clock },
        { label: "Embed phase:",      value: `${embedDuration}s`,                 icon: icons.bolt },
        { label: "Total time:",       value: `${totalDuration}s`,                 icon: icons.rocket },
        { label: "Avg/chunk:",        value: `${queueStats.avgChunkLatencyMs.toFixed(0)}ms`, icon: icons.gear },
        { label: "Batches sent:",     value: queueStats.totalBatchesSent,         icon: icons.vector },
    ]);
};
