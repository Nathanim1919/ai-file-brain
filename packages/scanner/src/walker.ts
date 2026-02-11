// Smart recursive directory walker
import fs from "fs/promises";
import path from "path";

interface WalkOptions {
    allowedExtensions: string[];    // WHITELIST: only index these file types
    ignoredDirs: string[];
    ignoredFiles: string[];
    projectMarkerFiles: string[];   // files that indicate a code project (skip entire dir)
    maxFileSizeMB?: number;         // skip files larger than this (default: 50MB)
    onSkip?: (path: string, reason: string) => void;
}

// Directories starting with "." are hidden - skip them always
const isHiddenEntry = (name: string): boolean => name.startsWith(".");

/**
 * Check if a directory is a software project (contains pom.xml, package.json, etc.)
 * If so, we skip the entire directory — users don't want to search inside code projects.
 */
const isProjectDirectory = async (dir: string, markers: string[]): Promise<boolean> => {
    try {
        const entries = await fs.readdir(dir);
        const entrySet = new Set(entries.map(e => e.toLowerCase()));

        for (const marker of markers) {
            // Support wildcard markers like "*.sln"
            if (marker.startsWith("*")) {
                const suffix = marker.slice(1).toLowerCase();
                if (entries.some(e => e.toLowerCase().endsWith(suffix))) return true;
            } else {
                if (entrySet.has(marker.toLowerCase())) return true;
            }
        }
    } catch {
        // can't read dir, not a project
    }
    return false;
};

export const walkDirectory = async (
    dir: string,
    options: WalkOptions
): Promise<string[]> => {
    let results: string[] = [];
    const maxSize = (options.maxFileSizeMB ?? 50) * 1024 * 1024;
    const skip = options.onSkip;

    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        skip?.(dir, (error as Error).message);
        return results;
    }

    for (const entry of entries) {
        const fullpath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (isHiddenEntry(entry.name)) continue;
            if (options.ignoredDirs.includes(entry.name)) continue;

            if (options.projectMarkerFiles.length > 0) {
                if (await isProjectDirectory(fullpath, options.projectMarkerFiles)) {
                    skip?.(fullpath, "project directory");
                    continue;
                }
            }

            const nested = await walkDirectory(fullpath, options);
            results = results.concat(nested);
        } else {
            if (isHiddenEntry(entry.name)) continue;
            if (options.ignoredFiles.includes(entry.name)) continue;

            const lowerName = entry.name.toLowerCase();
            if (options.allowedExtensions.length > 0) {
                const isAllowed = options.allowedExtensions.some(ext =>
                    lowerName.endsWith(ext.toLowerCase())
                );
                if (!isAllowed) continue;
            }

            try {
                const stat = await fs.stat(fullpath);
                if (stat.size > maxSize) {
                    skip?.(fullpath, `too large (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
                    continue;
                }
            } catch {
                continue;
            }

            results.push(fullpath);
        }
    }

    return results;
};
