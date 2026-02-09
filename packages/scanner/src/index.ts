import fs from "fs/promises";
import { walkDirectory } from "./walker.js";
import { extractMetadata } from "./metadata.js";
import pLimit from "p-limit";
import { upsertFile } from "../../../data/sqlite/db.js";

const CONCURRENCY_LIMIT = 5; //number of files processed at the same time
const limit = pLimit(CONCURRENCY_LIMIT);


export const runScanner = async () => {
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
                return metadata;
            }))
        );

        results.push(...metadataResults);
    }

    console.log(`✅ scanned ${results.length} files`)

    return results;
}
