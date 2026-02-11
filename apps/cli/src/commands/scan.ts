import { runScanner } from "../../../../packages/scanner/src/index.js";
import { IngestionService } from "../../../../packages/ai/ingestionService.js";
import { EmbeddingService } from "../../../../packages/ai/embedding.service.js";
import { VectorRepository } from "../../../../packages/repositories/vector.repository.js";
import { clearAllFiles } from "../../../../data/sqlite/db.js";
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

    // ─── Phase 1: Initialize services ──────────────────────
    const initSpinner = spin("Initializing AI services...");

    const vectorRepo = new VectorRepository();
    await vectorRepo.init();

    const ingestionService = new IngestionService(
        new EmbeddingService(),
        vectorRepo
    );

    initSpinner.succeed("AI services ready");

    // ─── Phase 1.5: Fresh mode — wipe everything ───────────
    if (flags.fresh) {
        const clearSpinner = spin("Clearing all indexes (fresh mode)...");

        // Clear SQLite files + FTS5
        clearAllFiles();

        // Drop and recreate LanceDB vector table
        await vectorRepo.reset();

        clearSpinner.succeed("All indexes cleared — starting fresh");
    }

    // ─── Phase 2 & 3: Discovery + Processing ──────────────
    let progressBar: ProgressBar | null = null;
    let embeddedCount = 0;
    let errorCount = 0;
    let totalFiles = 0;

    const callbacks: ScanCallbacks = {
        onDiscoveryStart(dir) {
            console.log(`\n  ${icons.folder} ${accent("Discovering files in")} ${dim(dir)}`);
        },

        onDiscoveryEnd(_dir, fileCount) {
            totalFiles = fileCount;
            console.log(`  ${icons.file} ${highlight(String(fileCount))} ${muted("files found")}\n`);

            // Start progress bar for processing phase
            progressBar = new ProgressBar(fileCount, {
                label: "Processing",
                showSpeed: true,
            });
        },

        onFileScanned(_name, _index, _total) {
            progressBar?.increment();
        },

        onFileEmbedded(name, _index, _total) {
            embeddedCount++;
        },

        onEmbedError(name, msg) {
            errorCount++;
            // Don't log during progress bar — collect and show in summary
        },

        onComplete(stats: ScanStats) {
            // Progress bar auto-stops. Summary printed below.
        },
    };

    const startTime = Date.now();
    const results = await runScanner({ ingestionService, callbacks });
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // ─── Final Summary ─────────────────────────────────────
    console.log();
    console.log(`  ${icons.sparkle} ${success("Scan complete")}${flags.fresh ? dim(" (fresh)") : ""}`);

    summaryBox([
        { label: "Files scanned:", value: results.length, icon: icons.file },
        { label: "Embedded:",      value: embeddedCount,   icon: icons.embed },
        { label: "Errors:",        value: errorCount,      icon: errorCount > 0 ? icons.warn : icons.check },
        { label: "Duration:",      value: `${duration}s`,  icon: icons.bolt },
    ]);
};
