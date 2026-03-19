import fs from "fs/promises";
import { walkDirectory } from "./walker.js";
import { extractMetadata } from "./metadata.js";
import pLimit from "p-limit";
import {
    db, upsertFile, buildContentHash, getStoredHash,
    getAllTrackedPaths, deleteFileByPath, backfillHash,
} from "../../db/index.js";
import { CONFIG_PATH } from "../../paths.js";
import type { IngestionService } from "../../ai/ingestionService.js";

const SCAN_CONCURRENCY = 10;

// ─── Event callbacks the CLI layer can subscribe to ────────
export interface ScanCallbacks {
    onDiscoveryStart?: (dir: string) => void;
    onDiscoveryEnd?: (dir: string, fileCount: number) => void;

    onFileScanned?: (name: string, index: number, total: number) => void;
    onFileSkipped?: (name: string) => void;
    onScanPhaseComplete?: (stats: ScanPhaseStats) => void;

    onEmbedPhaseStart?: (totalFiles: number) => void;
    onFileEmbedded?: (name: string, index: number, total: number, chunkCount: number) => void;
    onEmbedError?: (name: string, error: string) => void;
    onEmbedPhaseComplete?: (embeddedFiles: number, errors: number) => void;

    onDeletedDetected?: (count: number) => void;

    onComplete?: (stats: ScanStats) => void;
}

export interface ScanPhaseStats {
    newFiles: number;
    changedFiles: number;
    unchangedFiles: number;
    totalEmbeddable: number;
}

export interface ScanStats {
    totalDiscovered: number;
    newFiles: number;
    changedFiles: number;
    unchangedFiles: number;
    deletedFiles: number;
    embeddableFiles: number;
    embeddedFiles: number;
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

export type FileChangeStatus = "new" | "changed" | "unchanged";

interface ScanOptions {
    ingestionService?: IngestionService;
    callbacks?: ScanCallbacks;
    fresh?: boolean;
}

export const runScanner = async (options: ScanOptions = {}) => {
    const totalStart = Date.now();
    const cb = options.callbacks ?? {};

    const config = JSON.parse(
        await fs.readFile(CONFIG_PATH, "utf-8")
    );

    const walkOptions = {
        allowedExtensions: config.allowedExtensions || [],
        ignoredDirs: config.ignoredDirs || [],
        ignoredFiles: config.ignoredFiles || [],
        projectMarkerFiles: config.projectMarkerFiles || [],
    };

    // ═══════════════════════════════════════════════════════════
    //  PHASE 1: Discovery + Change Detection + Metadata
    // ═══════════════════════════════════════════════════════════
    const scanStart = Date.now();
    const scanLimit = pLimit(SCAN_CONCURRENCY);
    const scannedFiles: ScannedFile[] = [];
    const discoveredPaths = new Set<string>();

    let newCount = 0;
    let changedCount = 0;
    let unchangedCount = 0;

    for (const dir of config.allowedPaths) {
        cb.onDiscoveryStart?.(dir);

        const files = await walkDirectory(dir, walkOptions);
        cb.onDiscoveryEnd?.(dir, files.length);

        const total = files.length;
        let processed = 0;

        await Promise.all(
            files.map((file) => scanLimit(async () => {
                discoveredPaths.add(file);

                const stat = await fs.stat(file);
                const currentHash = buildContentHash(stat.size, stat.mtime.toISOString());
                const storedHash = options.fresh ? null : getStoredHash(file);

                let status: FileChangeStatus;
                if (storedHash === null) {
                    status = "new";
                    newCount++;
                } else if (storedHash === "" || storedHash === currentHash) {
                    // Empty hash = migrated from before incremental scanning.
                    // Same hash = file hasn't changed.
                    // Either way, backfill the hash and skip re-embedding.
                    status = "unchanged";
                    unchangedCount++;
                } else {
                    status = "changed";
                    changedCount++;
                }

                processed++;

                if (status === "unchanged") {
                    // Backfill hash for migrated rows that have empty content_hash
                    if (storedHash === "") {
                        backfillHash(file, currentHash);
                    }
                    cb.onFileSkipped?.(file);
                    cb.onFileScanned?.(file, processed, total);
                    return;
                }

                // File is new or changed — extract metadata + content
                const metadata = await extractMetadata(file);
                const metadataWithHash = { ...metadata, content_hash: currentHash };
                upsertFile(metadataWithHash);

                cb.onFileScanned?.(metadata.name, processed, total);

                if (metadata.content.length > 0) {
                    const row = db.prepare("SELECT id FROM files WHERE path = ?").get(metadata.path) as
                        { id: number } | undefined;
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
            }))
        );
    }

    const scanDurationMs = Date.now() - scanStart;

    cb.onScanPhaseComplete?.({
        newFiles: newCount,
        changedFiles: changedCount,
        unchangedFiles: unchangedCount,
        totalEmbeddable: scannedFiles.length,
    });

    // ═══════════════════════════════════════════════════════════
    //  PHASE 1.5: Detect & clean up deleted files
    // ═══════════════════════════════════════════════════════════
    let deletedCount = 0;
    const deletedFileIds: string[] = [];

    if (!options.fresh) {
        const trackedPaths = getAllTrackedPaths();

        for (const trackedPath of trackedPaths) {
            if (!discoveredPaths.has(trackedPath)) {
                const deletedId = deleteFileByPath(trackedPath);
                if (deletedId) deletedFileIds.push(deletedId);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            cb.onDeletedDetected?.(deletedCount);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  PHASE 2: Embedding (only new + changed files)
    // ═══════════════════════════════════════════════════════════
    const embedStart = Date.now();
    let embeddedCount = 0;
    let errorCount = 0;

    if (options.ingestionService && scannedFiles.length > 0) {
        cb.onEmbedPhaseStart?.(scannedFiles.length);

        const embedLimit = pLimit(3);
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
        totalDiscovered: discoveredPaths.size,
        newFiles: newCount,
        changedFiles: changedCount,
        unchangedFiles: unchangedCount,
        deletedFiles: deletedCount,
        embeddableFiles: scannedFiles.length,
        embeddedFiles: embeddedCount,
        errors: errorCount,
        durationMs: Date.now() - totalStart,
        scanDurationMs,
        embedDurationMs,
    };

    cb.onComplete?.(stats);

    return { scannedFiles, deletedFileIds, stats };
};
