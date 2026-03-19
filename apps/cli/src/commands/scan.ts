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
import type { ScanCallbacks, ScanPhaseStats } from "../../../../packages/scanner/src/index.js";

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
    //  PHASE 1: Discovery + Change Detection + Metadata
    // ═══════════════════════════════════════════════════════════
    let scanProgress: ProgressBar | null = null;
    let totalDiscovered = 0;
    let phaseStats: ScanPhaseStats | undefined;

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

        onScanPhaseComplete(stats) {
            phaseStats = stats;

            console.log(`\n  ${icons.check} ${success("Scan phase complete")}`);

            if (stats.unchangedFiles > 0) {
                console.log(`  ${icons.skip} ${muted(`${stats.unchangedFiles} unchanged files skipped`)}`);
            }
            if (stats.newFiles > 0) {
                console.log(`  ${icons.sparkle} ${accent(`${stats.newFiles} new`)} ${muted("files detected")}`);
            }
            if (stats.changedFiles > 0) {
                console.log(`  ${icons.bolt} ${accent(`${stats.changedFiles} changed`)} ${muted("files detected")}`);
            }
            if (stats.totalEmbeddable > 0) {
                console.log(`  ${icons.embed} ${highlight(String(stats.totalEmbeddable))} ${muted("files to embed")}`);
            }
        },

        onDeletedDetected(count) {
            console.log(`  ${icons.warn} ${warning(`${count} deleted`)} ${muted("files cleaned up from index")}`);
        },
    };

    const scanStart = Date.now();

    const { scannedFiles, deletedFileIds } = await runScanner({
        callbacks,
        ...(flags.fresh != null ? { fresh: flags.fresh } : {}),
    });

    const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);

    // ─── Clean up vectors for deleted files ───────────────────
    if (deletedFileIds.length > 0) {
        const deleteSpinner = spin(`Removing vectors for ${deletedFileIds.length} deleted files...`);
        for (const fid of deletedFileIds) {
            await vectorRepo.deleteByFileId(fid);
        }
        deleteSpinner.succeed(`Cleaned up vectors for ${deletedFileIds.length} deleted files`);
    }

    // ─── Nothing to embed? ────────────────────────────────────
    if (scannedFiles.length === 0) {
        if (phaseStats && phaseStats.unchangedFiles > 0) {
            console.log(`\n  ${icons.check} ${success("Everything is up to date!")} ${dim("No files need re-embedding.")}`);
        } else {
            console.log(`\n  ${icons.warn} ${warning("No embeddable files found.")} Check your config at ${accent("~/.ai-file-brain/config.json")}`);
        }

        summaryBox([
            { label: "Files discovered:", value: totalDiscovered,                icon: icons.file },
            { label: "Unchanged:",        value: phaseStats?.unchangedFiles ?? 0, icon: icons.skip },
            { label: "Deleted:",          value: deletedFileIds.length,           icon: icons.warn },
            { label: "Scan time:",        value: `${scanDuration}s`,             icon: icons.clock },
        ]);
        return;
    }

    // ═══════════════════════════════════════════════════════════
    //  PHASE 2: AI Embedding (via EmbeddingQueue)
    // ═══════════════════════════════════════════════════════════
    console.log(`\n  ${icons.embed} ${highlight("Embedding Phase")} ${dim("— sending chunks to Ollama")}`);

    // Clean up old vectors for changed files before re-embedding
    const changedFiles = scannedFiles.filter(f => {
        return phaseStats && phaseStats.changedFiles > 0;
    });

    if (phaseStats && phaseStats.changedFiles > 0) {
        const cleanSpinner = spin("Removing old vectors for changed files...");
        for (const file of scannedFiles) {
            await vectorRepo.deleteByFileId(file.fileId);
        }
        cleanSpinner.succeed("Old vectors removed");
    }

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
                // Queue fully drained
            },
        },
    });

    const tasks = scannedFiles.map(file => {
        const chunks = chunkText(file.content);
        const fileName = file.name.replace(/\.[^.]+$/, "");
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

    queue.pushAll(tasks);
    const queueStats = await queue.drain();
    const embedDuration = ((Date.now() - embedStart) / 1000).toFixed(1);

    // ═══════════════════════════════════════════════════════════
    //  Summary
    // ═══════════════════════════════════════════════════════════
    const totalDuration = ((Date.now() - scanStart) / 1000).toFixed(1);

    console.log();
    console.log(`  ${icons.sparkle} ${success("Scan complete")}${flags.fresh ? dim(" (fresh)") : dim(" (incremental)")}`);

    summaryBox([
        { label: "Files discovered:", value: totalDiscovered,                     icon: icons.file },
        { label: "New files:",        value: phaseStats?.newFiles ?? 0,           icon: icons.sparkle },
        { label: "Changed files:",    value: phaseStats?.changedFiles ?? 0,       icon: icons.bolt },
        { label: "Unchanged:",        value: phaseStats?.unchangedFiles ?? 0,     icon: icons.skip },
        { label: "Deleted:",          value: deletedFileIds.length,               icon: deletedFileIds.length > 0 ? icons.warn : icons.check },
        { label: "Files embedded:",   value: embeddedCount,                       icon: icons.embed },
        { label: "Total chunks:",     value: totalChunks,                         icon: icons.chunk },
        { label: "Errors:",           value: embedErrorCount,                     icon: embedErrorCount > 0 ? icons.warn : icons.check },
        { label: "Scan phase:",       value: `${scanDuration}s`,                  icon: icons.clock },
        { label: "Embed phase:",      value: `${embedDuration}s`,                 icon: icons.bolt },
        { label: "Total time:",       value: `${totalDuration}s`,                 icon: icons.rocket },
        { label: "Avg/chunk:",        value: `${queueStats.avgChunkLatencyMs.toFixed(0)}ms`, icon: icons.gear },
    ]);
};
