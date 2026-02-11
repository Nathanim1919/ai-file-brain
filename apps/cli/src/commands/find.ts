import { EmbeddingService } from "../../../../packages/ai/embedding.service.js";
import { VectorRepository } from "../../../../packages/repositories/vector.repository.js";
import path from "path";

export const handleFind = async (query: string) => {
    console.log(`\n🔎 Semantic search for: "${query}"\n`);

    try {
        // 1️⃣ Initialize services
        console.log("⏳ Connecting to vector store...");
        const embeddingService = new EmbeddingService();
        const vectorRepo = new VectorRepository();
        await vectorRepo.init();
        console.log("✅ Vector store connected\n");

        // 2️⃣ Embed the query
        console.log("🧠 Embedding query with Ollama...");
        const startEmbed = Date.now();
        const queryEmbedding = await embeddingService.embed(query);
        const embedTime = Date.now() - startEmbed;
        console.log(`✅ Query embedded (${queryEmbedding.length} dimensions, ${embedTime}ms)\n`);

        // 3️⃣ Search LanceDB for nearest chunks
        console.log("🔍 Searching vector database...");
        const startSearch = Date.now();
        const results = await vectorRepo.search(queryEmbedding, 10);
        const searchTime = Date.now() - startSearch;
        console.log(`✅ Search complete (${searchTime}ms)\n`);

        if (results.length === 0) {
            console.log("❌ No results found. Have you run `ai scan` yet?");
            return;
        }

        // 4️⃣ Group by file path (a file may have multiple matching chunks)
        const byFile = new Map<string, typeof results>();
        for (const r of results) {
            const existing = byFile.get(r.path) || [];
            existing.push(r);
            byFile.set(r.path, existing);
        }

        // 5️⃣ Display results
        console.log("━".repeat(60));
        console.log(`  📊 Results: ${results.length} chunks from ${byFile.size} file(s)`);
        console.log("━".repeat(60));

        // Sort files by best (lowest) distance
        const sorted = [...byFile.entries()].sort((a, b) => {
            const bestA = Math.min(...a[1].map(c => c._distance));
            const bestB = Math.min(...b[1].map(c => c._distance));
            return bestA - bestB;
        });

        let rank = 1;
        for (const [filePath, chunks] of sorted) {
            const bestDistance = Math.min(...chunks.map(c => c._distance));
            // Cosine distance is 0–2, so (1 - d) gives similarity from -1 to 1
            const similarity = (1 - bestDistance).toFixed(4);
            const preview = chunks[0].chunk_text.slice(0, 200).replace(/\n/g, " ");

            console.log(`\n  ${rank}. 📄 ${path.basename(filePath)}`);
            console.log(`     📁 ${filePath}`);
            console.log(`     ⭐ relevance: ${similarity}  (${chunks.length} matching chunk${chunks.length > 1 ? "s" : ""})`);
            console.log(`     📝 "${preview}…"`);
            rank++;
        }

        console.log("\n" + "━".repeat(60));
        console.log(`  ✅ Found ${sorted.length} file(s) across ${results.length} chunk(s)`);
        console.log(`  ⏱️  Total time: ${embedTime + searchTime}ms (embed: ${embedTime}ms, search: ${searchTime}ms)`);
        console.log("━".repeat(60) + "\n");

    } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes("No vector column") || msg.includes("empty")) {
            console.error("❌ Vector store is empty. Run `ai scan` first to index your files.");
        } else {
            console.error("❌ Semantic search failed:", msg);
        }
    }
}