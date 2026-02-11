import fs from "fs/promises";
import { walkDirectory } from "./walker.js";
import { extractMetadata } from "./metadata.js";
import pLimit from "p-limit";
import { db, upsertFile } from "../../../data/sqlite/db.js";
import type { IngestionService } from "../../ai/ingestionService.js";

const CONCURRENCY_LIMIT = 5; //number of files processed at the same time
const limit = pLimit(CONCURRENCY_LIMIT);

interface ScanOptions {
    /** If provided, files with text content will be chunked + embedded + stored */
    ingestionService?: IngestionService;
}

export const runScanner = async (options: ScanOptions = {}) => {
    const config = JSON.parse(
        await fs.readFile("config.json", "utf-8")
    )

    const results = [];

    const walkOptions = {
        allowedExtensions: config.allowedExtensions || [],
        ignoredDirs: config.ignoredDirs || [],
        ignoredFiles: config.ignoredFiles || [],
        projectMarkerFiles: config.projectMarkerFiles || [],
    };

    for (const dir of config.allowedPaths) {
        console.log("📂 scanning:", dir);

        const files = await walkDirectory(dir, walkOptions);

        console.log("📄", files.length, "files found");

        const metadataResults = await Promise.all(
            files.map((file) => limit(async () => {
                const metadata = await extractMetadata(file);
                upsertFile(metadata);
                console.log("✅", metadata.name);

                // If ingestion is enabled and file has text content → chunk + embed
                if (options.ingestionService && metadata.content.length > 0) {
                    try {
                        // Get the file_id from SQLite (the row we just upserted)
                        const row = db.prepare("SELECT id FROM FILES WHERE path = ?").get(metadata.path) as { id: number } | undefined;
                        const fileId = row ? String(row.id) : metadata.path;

                        await options.ingestionService.ingestDocument(
                            fileId,
                            metadata.path,
                            metadata.content
                        );
                        console.log("🧠 embedded:", metadata.name);
                    } catch (err) {
                        console.warn("⚠️  embedding failed for:", metadata.name, (err as Error).message);
                    }
                }

                return metadata;
            }))
        );

        results.push(...metadataResults);
    }

    const embeddedCount = results.filter(r => r.content.length > 0).length;
    console.log(`✅ scanned ${results.length} files (${embeddedCount} embedded)`);

    return results;
}
