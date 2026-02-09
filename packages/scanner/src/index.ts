import fs from "fs/promises";
import { walkDirectory } from "./walker.js";
import { extractMetadata } from "./metadata.js";
import { shouldIgnore } from "./filter.js";


export const runScanner = async () => {
    const config = JSON.parse(
        await fs.readFile("config.json", "utf-8")
    )

    const results = [];


    for (const dir of config.allowedPaths) {
        console.log("📂 scanning:", dir);

        const files = await walkDirectory(dir, ["node_modules", ".git"]);

        console.log("📄", files.length, "files found");


        const metadataResults = await Promise.all(
            files
                .filter(file => !shouldIgnore(file, config.ignored))
                .map(async (file) => {
                    const metadata = await extractMetadata(file);
                    console.log("✅", metadata.name);
                    return metadata;
                })
        );

        results.push(...metadataResults);
    }

    console.log(`✅ scanned ${results.length} files`)

    return results;
}