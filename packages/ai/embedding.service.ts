export class EmbeddingService {
    private endpoint = "http://localhost:11434/api/embeddings";
    private model = "nomic-embed-text";


    async embed(text: string): Promise<number[]> {
        const response = await fetch(this.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.model,
                prompt: text,
            }),
        });


        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`embedding failed (${response.status}): ${body}`);
        }

        const json = await response.json();
        return json.embedding;
    }
    
    async embedBarch(texts: string[]): Promise<number[][]> {
        const concurrency = 5;
        const results: number[][] = [];

        for (let i = 0; i < texts.length; i += concurrency) {
            const batch = texts.slice(i, i + concurrency);

            const embeddings = await Promise.all(
                batch.map((t) => this.embed(t))
            );

            results.push(...embeddings);
        }
        return results;
    }
}


