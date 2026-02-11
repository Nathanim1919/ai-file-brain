import fs from "fs/promises";
import { walkDirectory } from "./walker.js";
import { extractMetadata } from "./metadata.js";
import pLimit from "p-limit";
import { db, upsertFile } from "../../../data/sqlite/db.js";
import type { IngestionService } from "../../ai/ingestionService.js";

const CONCURRENCY_LIMIT = 5;
const limit = pLimit(CONCURRENCY_LIMIT);

// ─── Event callbacks the CLI layer can subscribe to ────────
export interface ScanCallbacks {
    onDiscoveryStart?: (dir: string) => void;
    onDiscoveryEnd?: (dir: string, fileCount: number) => void;
    onFileScanned?: (name: string, index: number, total: number) => void;
    onFileEmbedded?: (name: string, index: number, total: number) => void;
    onFileSkipped?: (name: string, reason: string) => void;
    onEmbedError?: (name: string, error: string) => void;
    onComplete?: (stats: ScanStats) => void;
}

export interface ScanStats {
    totalFiles: number;
    scannedFiles: number;
    embeddedFiles: number;
    skippedFiles: number;
    errors: number;
    durationMs: number;
}

interface ScanOptions {
    ingestionService?: IngestionService;
    callbacks?: ScanCallbacks;
}

export const runScanner = async (options: ScanOptions = {}) => {
    const startTime = Date.now();
    const cb = options.callbacks ?? {};
    let errorCount = 0;
    let skippedCount = 0;

    const config = JSON.parse(
        await fs.readFile("config.json", "utf-8")
    );

    const results = [];

    const walkOptions = {
        allowedExtensions: config.allowedExtensions || [],
        ignoredDirs: config.ignoredDirs || [],
        ignoredFiles: config.ignoredFiles || [],
        projectMarkerFiles: config.projectMarkerFiles || [],
    };

    for (const dir of config.allowedPaths) {
        cb.onDiscoveryStart?.(dir);

        const files = await walkDirectory(dir, walkOptions);

        cb.onDiscoveryEnd?.(dir, files.length);

        const total = files.length;
        let processed = 0;

        const metadataResults = await Promise.all(
            files.map((file) => limit(async () => {
                const metadata = await extractMetadata(file);
                upsertFile(metadata);

                processed++;
                cb.onFileScanned?.(metadata.name, processed, total);

                // If ingestion is enabled and file has text content → chunk + embed
                if (options.ingestionService && metadata.content.length > 0) {
                    try {
                        const row = db.prepare("SELECT id FROM FILES WHERE path = ?").get(metadata.path) as { id: number } | undefined;
                        const fileId = row ? String(row.id) : metadata.path;

                        await options.ingestionService.ingestDocument(
                            fileId,
                            metadata.path,
                            metadata.content
                        );
                        cb.onFileEmbedded?.(metadata.name, processed, total);
                    } catch (err) {
                        errorCount++;
                        cb.onEmbedError?.(metadata.name, (err as Error).message);
                    }
                }

                return metadata;
            }))
        );

        results.push(...metadataResults);
    }

    const stats: ScanStats = {
        totalFiles: results.length,
        scannedFiles: results.length,
        embeddedFiles: results.filter(r => r.content.length > 0).length,
        skippedFiles: skippedCount,
        errors: errorCount,
        durationMs: Date.now() - startTime,
    };

    cb.onComplete?.(stats);

    return results;
};
