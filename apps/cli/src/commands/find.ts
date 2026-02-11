import { EmbeddingService } from "../../../../packages/ai/embedding.service.js";
import { VectorRepository } from "../../../../packages/repositories/vector.repository.js";
import path from "path";
import {
    banner, brand, accent, success, warning, error as errorColor, dim, muted, highlight, subtle,
    icons, line, summaryBox, sectionHeader,
    spin,
} from "../../../../packages/cli-ui/index.js";
import chalk from "chalk";

export const handleFind = async (query: string) => {
    banner();
    console.log(`  ${icons.search} ${highlight("Semantic Search")} ${dim("— AI-powered file retrieval")}`);
    console.log(`  ${dim("Query:")} ${accent(`"${query}"`)}\n`);

    try {
        // 1️⃣ Initialize
        const initSpinner = spin("Connecting to vector store...");
        const embeddingService = new EmbeddingService();
        const vectorRepo = new VectorRepository();
        await vectorRepo.init();
        initSpinner.succeed("Vector store connected");

        // 2️⃣ Embed the query
        const embedSpinner = spin("Embedding query with Ollama...");
        const startEmbed = Date.now();
        const queryEmbedding = await embeddingService.embed(query);
        const embedTime = Date.now() - startEmbed;
        embedSpinner.succeed(`Query embedded ${dim(`(${queryEmbedding.length}d, ${embedTime}ms)`)}`);

        // 3️⃣ Vector search
        const searchSpinner = spin("Searching vector database...");
        const startSearch = Date.now();
        const results = await vectorRepo.search(queryEmbedding, 30);
        const searchTime = Date.now() - startSearch;
        searchSpinner.succeed(`Search complete ${dim(`(${searchTime}ms)`)}`);

        if (results.length === 0) {
            console.log(`\n  ${icons.fail} ${errorColor("No results found.")} Run ${accent("ai scan")} first to index your files.`);
            return;
        }

        // 4️⃣ Group by file path
        const byFile = new Map<string, typeof results>();
        for (const r of results) {
            const existing = byFile.get(r.path) || [];
            existing.push(r);
            byFile.set(r.path, existing);
        }

        // 5️⃣ Re-rank: vector similarity + keyword filename boost
        const STOP_WORDS = new Set([
            "i", "a", "to", "me", "my", "the", "is", "it", "of", "in", "and", "or",
            "you", "we", "do", "an", "be", "am", "at", "on", "for", "so", "if", "as",
            "by", "up", "no", "not", "but", "was", "are", "has", "had", "can", "will",
            "from", "that", "this", "with", "have", "want", "give", "find", "get", "show",
            "any", "about",
        ]);
        const queryTokens = query.toLowerCase().split(/[/\s]+/).filter(t => t.length >= 2 && !STOP_WORDS.has(t));

        const scored = [...byFile.entries()].map(([filePath, chunks]) => {
            const bestDistance = Math.min(...chunks.map(c => c._distance));
            const vectorSimilarity = 1 - bestDistance;

            const fileNameLower = path.basename(filePath).toLowerCase();
            const pathLower = filePath.toLowerCase();
            const nameHits = queryTokens.filter(t => fileNameLower.includes(t)).length;
            const pathHits = queryTokens.filter(t => pathLower.includes(t)).length;

            const nameBoost = queryTokens.length > 0 ? (nameHits / queryTokens.length) * 0.15 : 0;
            const pathBoost = queryTokens.length > 0 ? (pathHits / queryTokens.length) * 0.05 : 0;
            const chunkBoost = Math.min(chunks.length * 0.01, 0.05);

            const finalScore = vectorSimilarity + nameBoost + pathBoost + chunkBoost;

            return { filePath, chunks, vectorSimilarity, finalScore, nameBoost };
        });

        scored.sort((a, b) => b.finalScore - a.finalScore);
        const topResults = scored.slice(0, 10);

        // 6️⃣ Display results
        console.log();
        console.log(`  ${line(56)}`);
        console.log(`  ${icons.star} ${highlight(`${topResults.length} results`)} ${muted(`from ${scored.length} files (${results.length} chunks)`)}`);
        console.log(`  ${line(56)}`);

        let rank = 1;
        for (const { filePath, chunks, finalScore, vectorSimilarity, nameBoost } of topResults) {
            const preview = chunks[0]?.chunk_text.slice(0, 150).replace(/\n/g, " ") ?? "";
            const fileName = path.basename(filePath);
            const dir = path.dirname(filePath);

            // Relevance bar (visual indicator)
            const barLen = Math.round(finalScore * 20);
            const bar = brand("█".repeat(barLen)) + dim("░".repeat(20 - barLen));

            const nameTag = nameBoost > 0 ? ` ${accent(icons.tag + " name match")}` : "";
            const rankColor = rank <= 3 ? highlight : muted;

            console.log();
            console.log(`  ${rankColor(`${rank}.`)} ${icons.file} ${highlight(fileName)}${nameTag}`);
            console.log(`     ${dim(dir)}`);
            console.log(`     ${bar} ${brand(finalScore.toFixed(4))} ${dim(`(vector: ${vectorSimilarity.toFixed(4)})`)}`);
            console.log(`     ${subtle(`"${preview}…"`)}`);

            rank++;
        }

        // 7️⃣ Summary
        summaryBox([
            { label: "Files found:", value: `${topResults.length} of ${scored.length}`, icon: icons.file },
            { label: "Embed time:", value: `${embedTime}ms`, icon: icons.embed },
            { label: "Search time:", value: `${searchTime}ms`, icon: icons.search },
            { label: "Total time:", value: `${embedTime + searchTime}ms`, icon: icons.bolt },
        ]);

    } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("No vector column") || msg.includes("empty")) {
            console.error(`\n  ${icons.fail} ${errorColor("Vector store is empty.")} Run ${accent("ai scan")} first.`);
        } else {
            console.error(`\n  ${icons.fail} ${errorColor("Semantic search failed:")} ${msg}`);
        }
    }
};
