import fs from "fs/promises";
import path from "path";
import { extractContent, isExtractable } from "./extractor.js";
import { buildContentHash } from "../../db/index.js";

export const extractMetadata = async (filePath: string) => {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let content = "";
    if (isExtractable(filePath)) {
        try {
            content = await extractContent(filePath);
        } catch {
            // extraction failed — skip content
        }
    }

    return {
        name: path.basename(filePath),
        path: filePath,
        size: stat.size,
        type: ext,
        content,
        content_hash: buildContentHash(stat.size, stat.mtime.toISOString()),
        created_at: stat.birthtime.toISOString(),
        modified_at: stat.mtime.toISOString(),
    };
}