// Extract metadata from a file

import fs from "fs/promises";
import path from "path";

export const extractMetadata = async (filePath: string) => {
    const stat = await fs.stat(filePath);

    return {
        name: path.basename(filePath),
        path: filePath,
        size: stat.size,
        modified: stat.mtime,
        extension: path.extname(filePath),
    }
}