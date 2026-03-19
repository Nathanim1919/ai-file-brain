import * as lancedb from "@lancedb/lancedb";
import type { Connection, Table, VectorQuery } from "@lancedb/lancedb";
import { VECTORS_DIR } from "../paths.js";

export interface VectorSearchResult {
    id: string;
    file_id: string;
    path: string;
    chunk_index: number;
    chunk_text: string;
    start_line: number;
    end_line: number;
    language: string;
    _distance: number;
}

export class VectorRepository {
    private db: Connection | undefined;
    private table: Table | undefined;
    private readonly TABLE_NAME = "chunks";


    async init() {
        this.db = await lancedb.connect(VECTORS_DIR);

        try {
            this.table = await this.db.openTable(this.TABLE_NAME);
        } catch (error) {
            this.table = await this.db.createTable(this.TABLE_NAME, [
                {
                    id: "init",
                    file_id: "",
                    path: "",
                    chunk_index: 0,
                    chunk_text: "",
                    embedding: Array.from(new Float32Array(768)),
                    start_line: 0,
                    end_line: 0,
                    language: "",
                }
            ]);

            await this.table.delete("id = 'init'");
        }
    }


    async insert(rows: any[]) {
        if (!this.table) throw new Error("VectorRepository not initialized. Call init() first.");
        await this.table.add(rows);
    }


    /**
     * Semantic vector search — finds the closest chunks to the query embedding.
     * @param queryEmbedding - the embedding vector of the user's search query
     * @param limit - max number of results to return (default 10)
     */
    async search(queryEmbedding: number[], limit = 10): Promise<VectorSearchResult[]> {
        if (!this.table) throw new Error("VectorRepository not initialized. Call init() first.");

        const results = await (this.table
            .search(queryEmbedding) as VectorQuery)
            .distanceType("cosine")
            .limit(limit)
            .toArray();

        return results as unknown as VectorSearchResult[];
    }


    /**
     * Count total rows in the vector table.
     */
    async countRows(): Promise<number> {
        if (!this.table) throw new Error("VectorRepository not initialized. Call init() first.");
        return this.table.countRows();
    }

    /**
     * Get all rows (for stats aggregation). Use with care on large tables.
     */
    async getAllRows(): Promise<{ file_id: string; path: string; chunk_index: number }[]> {
        if (!this.table) throw new Error("VectorRepository not initialized. Call init() first.");
        const rows = await this.table.query().select(["file_id", "path", "chunk_index"]).toArray();
        return rows as unknown as { file_id: string; path: string; chunk_index: number }[];
    }

    /**
     * Delete all vector chunks belonging to a specific file.
     * Used when a file changes (delete old vectors, then re-embed).
     */
    async deleteByFileId(fileId: string): Promise<void> {
        if (!this.table) throw new Error("VectorRepository not initialized. Call init() first.");
        try {
            await this.table.delete(`file_id = '${fileId}'`);
        } catch {
            // Row may not exist — that's fine
            console.error(`Row with file_id ${fileId} not found in vector table.`);
        }
    }

    /**
     * Drop and recreate the vector table — used by `scan --fresh`.
     * Destroys all stored embeddings and starts with an empty table.
     */
    async reset(): Promise<void> {
        if (!this.db) throw new Error("VectorRepository not initialized. Call init() first.");

        // Drop existing table if it exists
        try {
            await this.db.dropTable(this.TABLE_NAME);
        } catch {
            // Table didn't exist — that's fine
        }

        // Recreate with correct schema
        this.table = await this.db.createTable(this.TABLE_NAME, [
            {
                id: "init",
                file_id: "",
                path: "",
                chunk_index: 0,
                chunk_text: "",
                embedding: Array.from(new Float32Array(768)),
                start_line: 0,
                end_line: 0,
                language: "",
            }
        ]);

        await this.table.delete("id = 'init'");
    }
}