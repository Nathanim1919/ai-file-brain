import { Hono } from "hono";
import fs from "fs";
import { serve } from "@hono/node-server";
import { clearAllFiles, db } from "../../packages/db/index.js";
import { VectorRepository } from "../../packages/repositories/vector.repository.js";
import { getInstalledModels, isOllamaRunning } from "../../packages/ai/ollama.js";
import { CONFIG_PATH, DB_PATH, VECTORS_DIR } from "../../packages/paths.js";
import path from "path";
import { EmbeddingService } from "../../packages/ai/embedding.service.js";
import { runScanner } from "../../packages/scanner/src/index.js";
import { EmbeddingQueue } from "../../packages/ai/embeddingQueue.js";
import { chunkText } from "../../packages/ai/chunker.js";
import { SearchRepository } from "../core/repositories/search.repository.js";

const app = new Hono();

const PORT = 4821;


app.get("/api/health", (c) => {
    return c.json({
        ok: true,
        timestamp: new Date().toISOString(),
    })
});



app.get('/api/stats', async (c) => {
    // SQLite stats
    const fileCount = (db.prepare("SELECT COUNT(*) AS count FROM files").get() as any).count;
    const totalSize = (db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM files").get() as any).total;

    const topTypes = db.prepare(`
        SELECT type, COUNT(*) as count FROM files
        GROUP BY type ORDER BY count DESC LIMIT 8    
    `).all();


    // Vector stats
    const vectorRepo = new VectorRepository();
    await vectorRepo.init();
    const totalChunks = await vectorRepo.countRows();


    // Ollama stats
    const running = await isOllamaRunning();
    const models = running ? await getInstalledModels() : [];

    // Storage sizes
    const sqliteSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;

    let vectorSize = 0;
    if (fs.existsSync(VECTORS_DIR)) {
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

        vectorSize = getSize(VECTORS_DIR);
    }


    return c.json({
        files: { count: fileCount, totalSize, topTypes },
        vectors: { totalChunks },
        ollama: { running: running, models },
        storage: { sqlite: sqliteSize, vectors: vectorSize, total: sqliteSize + vectorSize },
    })
})



app.get("/api/status/ollama", async (c) => {
    const running = await isOllamaRunning();
    const models = running ? await getInstalledModels() : [];
    return c.json({ running, models });
});



app.post("/api/search", async (c) => {
    const searchRepository = new SearchRepository();
    const { query, limit } = await c.req.json();

    if (!query || typeof query !== "string") {
        return c.json({ error: "query is required" }, 400);
    }

    const results = searchRepository.search(query, limit ?? 20);
    return c.json({ query, results, count: results.length });
});



app.post("/api/find", async (c) => {
    const { query, limit } = await c.req.json();

    if (!query || typeof query !== "string") {
        return c.json({ error: "query is required" }, 400);
    }

    const embeddingService = new EmbeddingService();
    const vectorRepo = new VectorRepository();
    await vectorRepo.init();

    // Embed the query
    const startEmbed = Date.now();
    const queryEmbedding = await embeddingService.embed(query);
    const embedTime = Date.now() - startEmbed;

    // Vector search
    const startSearch = Date.now();
    const rawResults = await vectorRepo.search(queryEmbedding, limit ?? 30);
    const searchTime = Date.now() - startSearch;

    // Group by file path and pick best score per file
    const byFile = new Map<string, typeof rawResults>();
    for (const r of rawResults) {
        const existing = byFile.get(r.path) || [];
        existing.push(r);
        byFile.set(r.path, existing);
    }

    const results = [...byFile.entries()].map(([filePath, chunks]) => {
        const bestDistance = Math.min(...chunks.map(ch => ch._distance));
        const similarity = 1 - bestDistance;
        const preview = chunks[0]?.chunk_text.slice(0, 200) ?? "";

        return {
            path: filePath,
            fileName: path.basename(filePath),
            similarity: Math.round(similarity * 10000) / 10000,
            chunkCount: chunks.length,
            preview,
        };
    });

    results.sort((a, b) => b.similarity - a.similarity);

    return c.json({
        query,
        results: results.slice(0, 10),
        totalFiles: results.length,
        timing: { embedMs: embedTime, searchMs: searchTime },
    });
});



app.get("/api/config", (c) => {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    return c.json(config);
});

app.put("/api/config", async (c) => {
    const newConfig = await c.req.json();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 4) + "\n");
    return c.json({ ok: true });
});



app.post("/api/scan", async (c) => {
    const { fresh } = await c.req.json().catch(() => ({ fresh: false }));

    if (fresh) {
        clearAllFiles();
        const vectorRepo = new VectorRepository();
        await vectorRepo.init();
        await vectorRepo.reset();
    }

    const { scannedFiles, stats } = await runScanner({ fresh });

    // Embed new/changed files
    if (scannedFiles.length > 0) {
        const embeddingService = new EmbeddingService();
        const vectorRepo = new VectorRepository();
        await vectorRepo.init();

        const queue = new EmbeddingQueue(embeddingService, vectorRepo, {
            concurrency: 2,
        });

        const tasks = scannedFiles.map(file => ({
            fileId: file.fileId,
            path: file.path,
            fileName: file.name.replace(/\.[^.]+$/, ""),
            chunks: chunkText(file.content),
        })).filter(t => t.chunks.length > 0);

        queue.pushAll(tasks);
        const queueStats = await queue.drain();

        return c.json({
            ...stats,
            embedded: queueStats.completed,
            embeddingErrors: queueStats.failed,
            totalChunks: tasks.reduce((sum, t) => sum + t.chunks.length, 0),
        });
    }

    return c.json(stats);
});




serve({
    fetch: app.fetch,
    port: PORT,
}, (info) => {
    console.log(`Server is running on port ${info.port}`);
});