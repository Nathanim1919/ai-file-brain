import { randomUUID } from "crypto";
import nodePath from "path";
import type { EmbeddingService } from "./embedding.service.js";
import type { VectorRepository } from "../repositories/vector.repository.js";
import { chunkText } from "./chunker.js";

export class IngestionService {
  constructor(
    private embeddingService: EmbeddingService,
    private vectorRepo: VectorRepository
  ) {}

  async ingestDocument(fileId: string, path: string, content: string) {
    // 1️⃣ chunk
    const chunks = chunkText(content);

    // 2️⃣ embed batch — prepend filename context so embeddings carry file identity
    const fileName = nodePath.basename(path, nodePath.extname(path));
    const embeddings = await this.embeddingService.embedBarch(
      chunks.map(c => `[File: ${fileName}]\n${c.text}`)
    );

    

    // 3️⃣ build rows
    const rows = chunks.map((chunk, i) => ({
      id: randomUUID(),
      file_id: fileId,
      path,
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      embedding: embeddings[i]!,
      start_line: chunk.startLine,
      end_line: chunk.endLine,
      language: "text"
    }));

    // 4️⃣ store
    await this.vectorRepo.insert(rows);
  }
}
