/**
 * Standalone ingestion example.
 * 
 * In production, ingestion is integrated into the CLI scan command:
 *   npx tsx apps/cli/src/index.ts scan
 * 
 * This file is kept as a reference / for manual one-off ingestion.
 */
import { EmbeddingService } from "../../packages/ai/embedding.service.js";
import { IngestionService } from "../../packages/ai/ingestionService.js";
import { VectorRepository } from "../../packages/repositories/vector.repository.js";

export async function ingestFile(fileId: string, filePath: string, fileContent: string) {
    const repo = new VectorRepository();
    await repo.init();

    const ingestion = new IngestionService(
        new EmbeddingService(),
        repo
    );

    await ingestion.ingestDocument(fileId, filePath, fileContent);
}
