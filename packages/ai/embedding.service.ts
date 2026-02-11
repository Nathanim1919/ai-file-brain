/**
 * 🧠 EmbeddingService — Ollama embedding interface
 *
 * Uses the /api/embed batch endpoint for maximum throughput:
 *   POST /api/embed  { model, input: string[] }  →  { embeddings: number[][] }
 *
 * Single-text embed() still available for search queries.
 * Batch requests are chunked to avoid overwhelming Ollama's memory.
 */

export interface EmbeddingStats {
    totalTexts: number;
    totalBatches: number;
    totalDurationMs: number;
    avgPerText: number;
    avgPerBatch: number;
}

export class EmbeddingService {
    private readonly endpoint: string;
    private readonly model: string;

    /**
     * Max texts per single /api/embed request.
     * Ollama loads all inputs into GPU memory at once — too many will OOM.
     * nomic-embed-text with 768-dim is light; 64 is conservative & safe.
     */
    private readonly maxBatchSize: number;

    constructor(options?: { endpoint?: string; model?: string; maxBatchSize?: number }) {
        this.endpoint = options?.endpoint ?? "http://localhost:11434/api/embed";
        this.model = options?.model ?? "nomic-embed-text";
        this.maxBatchSize = options?.maxBatchSize ?? 64;
    }


    // ─── Single text embedding (for search queries) ──────────────

    async embed(text: string): Promise<number[]> {
        const result = await this.embedBatch([text]);
        return result[0]!;
    }


    // ─── True batch embedding (single HTTP request per batch) ────

    /**
     * Embed multiple texts in one request to Ollama's /api/embed endpoint.
     * Automatically chunks into sub-batches if texts.length > maxBatchSize.
     *
     * Returns embeddings in the same order as the input texts.
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        const allEmbeddings: number[][] = [];

        // Sub-batch to avoid Ollama OOM on large payloads
        for (let i = 0; i < texts.length; i += this.maxBatchSize) {
            const batch = texts.slice(i, i + this.maxBatchSize);
            const embeddings = await this._requestBatch(batch);
            allEmbeddings.push(...embeddings);
        }

        return allEmbeddings;
    }


    /**
     * Embed a batch with full timing stats (useful for CLI progress reporting).
     */
    async embedBatchWithStats(texts: string[]): Promise<{ embeddings: number[][]; stats: EmbeddingStats }> {
        if (texts.length === 0) {
            return {
                embeddings: [],
                stats: { totalTexts: 0, totalBatches: 0, totalDurationMs: 0, avgPerText: 0, avgPerBatch: 0 },
            };
        }

        const allEmbeddings: number[][] = [];
        const startTime = Date.now();
        let batchCount = 0;

        for (let i = 0; i < texts.length; i += this.maxBatchSize) {
            const batch = texts.slice(i, i + this.maxBatchSize);
            const embeddings = await this._requestBatch(batch);
            allEmbeddings.push(...embeddings);
            batchCount++;
        }

        const totalDurationMs = Date.now() - startTime;

        return {
            embeddings: allEmbeddings,
            stats: {
                totalTexts: texts.length,
                totalBatches: batchCount,
                totalDurationMs,
                avgPerText: texts.length > 0 ? totalDurationMs / texts.length : 0,
                avgPerBatch: batchCount > 0 ? totalDurationMs / batchCount : 0,
            },
        };
    }


    // ─── Internal: single HTTP request to /api/embed ─────────────

    private async _requestBatch(texts: string[]): Promise<number[][]> {
        const response = await fetch(this.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.model,
                input: texts,
            }),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`Embedding batch failed (${response.status}): ${body}`);
        }

        const json = (await response.json()) as { embeddings: number[][] };

        if (!json.embeddings || json.embeddings.length !== texts.length) {
            throw new Error(
                `Embedding batch mismatch: sent ${texts.length} texts, got ${json.embeddings?.length ?? 0} embeddings`
            );
        }

        return json.embeddings;
    }
}
