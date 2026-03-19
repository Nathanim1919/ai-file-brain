/**
 * 📊 ai stats — Show index statistics
 *
 * Displays info about:
 *   - SQLite: total indexed files, file types, total size
 *   - LanceDB: total chunks, unique files embedded, avg chunks/file
 *   - Ollama: running status, models installed
 */

import { db } from "../../../../packages/db/index.js";
import { VectorRepository } from "../../../../packages/repositories/vector.repository.js";
import { DB_PATH, VECTORS_DIR } from "../../../../packages/paths.js";
import path from "path";
import {
    banner, brand, accent, success, warning, error as errorStyle, dim, muted, highlight,
    icons, line, summaryBox, sectionHeader,
    spin,
} from "../../../../packages/cli-ui/index.js";
import { isOllamaRunning, getInstalledModels } from "../../../../packages/ai/ollama.js";

// ─── Helpers ───────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}


// ─── Main ──────────────────────────────────────────────────

export const handleStats = async () => {
    banner();
    console.log(`  ${icons.gear} ${highlight("Index Statistics")} ${dim("— overview of your AI File Brain")}\n`);

    // ═══════════════════════════════════════════════════════════
    //  SQLite Stats
    // ═══════════════════════════════════════════════════════════
    sectionHeader("SQLite — File Metadata");

    try {
        const fileCount = (db.prepare("SELECT COUNT(*) as count FROM files").get() as any).count;
        const totalSize = (db.prepare("SELECT COALESCE(SUM(size), 0) as total FROM files").get() as any).total;

        // Top file types
        const topTypes = db.prepare(`
            SELECT type, COUNT(*) as count
            FROM files
            GROUP BY type
            ORDER BY count DESC
            LIMIT 8
        `).all() as { type: string; count: number }[];

        // Top directories (group by parent dir)
        const topDirs = db.prepare(`
            SELECT path, COUNT(*) as count
            FROM (
                SELECT SUBSTR(path, 1, INSTR(path || '/', '/') - 1) as path
                FROM files
            )
            GROUP BY path
            ORDER BY count DESC
            LIMIT 5
        `).all() as { path: string; count: number }[];

        // Newest and oldest files
        const newest = db.prepare("SELECT name, modified_at FROM files ORDER BY modified_at DESC LIMIT 1").get() as { name: string; modified_at: string } | undefined;
        const oldest = db.prepare("SELECT name, modified_at FROM files ORDER BY modified_at ASC LIMIT 1").get() as { name: string; modified_at: string } | undefined;

        console.log(`  ${icons.file} ${muted("Total files:")}       ${highlight(String(fileCount))}`);
        console.log(`  ${icons.gear} ${muted("Total size:")}        ${highlight(formatBytes(totalSize))}`);

        if (newest) {
            const newestDate = new Date(newest.modified_at).toLocaleDateString();
            console.log(`  ${icons.clock} ${muted("Newest file:")}       ${accent(newest.name)} ${dim(`(${newestDate})`)}`);
        }
        if (oldest) {
            const oldestDate = new Date(oldest.modified_at).toLocaleDateString();
            console.log(`  ${icons.clock} ${muted("Oldest file:")}       ${accent(oldest.name)} ${dim(`(${oldestDate})`)}`);
        }

        if (topTypes.length > 0) {
            console.log();
            console.log(`  ${muted("File types:")}`);
            for (const t of topTypes) {
                const barLen = Math.round((t.count / fileCount) * 20);
                const bar = brand("█".repeat(barLen)) + dim("░".repeat(20 - barLen));
                console.log(`    ${bar} ${highlight(String(t.count).padStart(4))} ${dim(t.type || "(no ext)")}`);
            }
        }

        if (fileCount === 0) {
            console.log(`\n  ${icons.warn} ${warning("No files indexed.")} Run ${accent("ai scan")} first.`);
        }
    } catch (err) {
        console.log(`  ${icons.fail} ${errorStyle("Could not read SQLite database.")}`);
    }

    // ═══════════════════════════════════════════════════════════
    //  Vector DB Stats
    // ═══════════════════════════════════════════════════════════
    console.log();
    sectionHeader("LanceDB — Vector Embeddings");

    try {
        const vectorRepo = new VectorRepository();
        await vectorRepo.init();

        const totalChunks = await vectorRepo.countRows();

        if (totalChunks === 0) {
            console.log(`  ${icons.warn} ${warning("No embeddings yet.")} Run ${accent("ai scan")} to embed files.`);
        } else {
            // Get all rows for aggregation
            const rows = await vectorRepo.getAllRows();
            const uniqueFiles = new Set(rows.map(r => r.file_id)).size;
            const uniquePaths = new Set(rows.map(r => r.path));
            const avgChunks = totalChunks / (uniqueFiles || 1);

            // Top embedded directories
            const dirCounts = new Map<string, number>();
            for (const r of rows) {
                const dir = path.dirname(r.path);
                dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
            }
            const topEmbedDirs = [...dirCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            console.log(`  ${icons.chunk} ${muted("Total chunks:")}      ${highlight(String(totalChunks))}`);
            console.log(`  ${icons.file} ${muted("Files embedded:")}    ${highlight(String(uniqueFiles))}`);
            console.log(`  ${icons.vector} ${muted("Avg chunks/file:")}  ${highlight(avgChunks.toFixed(1))}`);
            console.log(`  ${icons.embed} ${muted("Embedding dim:")}    ${highlight("768")} ${dim("(nomic-embed-text)")}`);

            if (topEmbedDirs.length > 0) {
                console.log();
                console.log(`  ${muted("Top directories by chunks:")}`);
                for (const [dir, count] of topEmbedDirs) {
                    const barLen = Math.round((count / totalChunks) * 20);
                    const bar = brand("█".repeat(barLen)) + dim("░".repeat(20 - barLen));
                    console.log(`    ${bar} ${highlight(String(count).padStart(4))} ${dim(dir)}`);
                }
            }
        }
    } catch (err) {
        console.log(`  ${icons.fail} ${errorStyle("Could not read vector database.")}`);
    }

    // ═══════════════════════════════════════════════════════════
    //  Ollama Status
    // ═══════════════════════════════════════════════════════════
    console.log();
    sectionHeader("Ollama — AI Engine");

    const running = await isOllamaRunning();

    if (running) {
        console.log(`  ${icons.check} ${success("Ollama is running")}`);

        const models = await getInstalledModels();
        if (models.length > 0) {
            console.log(`  ${icons.brain} ${muted("Installed models:")}`);
            for (const m of models) {
                console.log(`    ${accent("•")} ${highlight(m.name)} ${dim(`(${formatBytes(m.size)})`)}`);
            }
        }
    } else {
        console.log(`  ${icons.fail} ${errorStyle("Ollama is not running")}`);
        console.log(`  ${dim("Start it with:")} ${accent("ollama serve")}`);
    }

    // ═══════════════════════════════════════════════════════════
    //  Database file sizes
    // ═══════════════════════════════════════════════════════════
    console.log();
    sectionHeader("Storage");

    try {
        const fs = await import("fs");

        const sqliteSize = fs.existsSync(DB_PATH)
            ? fs.statSync(DB_PATH).size : 0;

        let vectorSize = 0;
        const vectorDir = VECTORS_DIR;
        if (fs.existsSync(vectorDir)) {
            const getSize = (dir: string): number => {
                let total = 0;
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        total += getSize(fullPath);
                    } else {
                        total += fs.statSync(fullPath).size;
                    }
                }
                return total;
            };
            vectorSize = getSize(vectorDir);
        }

        console.log(`  ${icons.file} ${muted("SQLite DB:")}         ${highlight(formatBytes(sqliteSize))}`);
        console.log(`  ${icons.vector} ${muted("Vector DB:")}         ${highlight(formatBytes(vectorSize))}`);
        console.log(`  ${icons.gear} ${muted("Total storage:")}     ${highlight(formatBytes(sqliteSize + vectorSize))}`);
    } catch {
        console.log(`  ${icons.warn} ${warning("Could not calculate storage sizes.")}`);
    }

    console.log();
};
