// Extract metadata from a file

import fs from "fs/promises";
import path from "path";
import { extractContent, isExtractable } from "./extractor.js";

export const extractMetadata = async (filePath: string) => {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Extract text content for embeddable file types (txt, md, pdf, docx, etc.)
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
        created_at: stat.birthtime.toISOString(),
        modified_at: stat.mtime.toISOString(),
    }
}