// Simple recursive directory walker
import fs from "fs/promises";
import path from "path";


export const walkDirectory = async (
    dir: string,
    ignoredDirs = ["node_modules"]
) => {
    let results: string[] = [];

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });


        const tasks = entries.map(async (entry) => {
            const fullpath = path.join(dir, entry.name);

            const stat = await fs.stat(fullpath);

            if (stat.isDirectory()) {
                await walkDirectory(fullpath, ignoredDirs);
            } else {
                results.push(fullpath);
            }

        });

        await Promise.all(tasks);

    } catch (err) {
        if (err.code === "EACCES" || err.code === "ENOENT") {
            console.warn("⚠️  skipping:", dir, err.code);
        } else {
            throw err;
        }
    }

    return results;
}