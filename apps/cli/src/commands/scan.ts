import { runScanner } from "../../../../packages/scanner/src/index.js";
import { IngestionService } from "../../../../packages/ai/ingestionService.js";
import { EmbeddingService } from "../../../../packages/ai/embedding.service.js";
import { VectorRepository } from "../../../../packages/repositories/vector.repository.js";

export const handleScan = async () => {
    console.log("🔍 Starting scan...\n");

    // Initialize vector store + ingestion pipeline
    const vectorRepo = new VectorRepository();
    await vectorRepo.init();

    const ingestionService = new IngestionService(
        new EmbeddingService(),
        vectorRepo
    );

    // Run scanner with ingestion enabled
    const files = await runScanner({ ingestionService });

    console.log(`\n✅ Done! Scanned ${files.length} files.`);
}