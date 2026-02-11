export interface Chunk {
    text: string;
    index: number;
    startLine: number;
    endLine: number;
}


export const chunkText = (
    content: string,
    maxChars = 1200,
    overlap = 200,
): Chunk[] => {
    const lines = content.split("\n");
    const chunks: Chunk[] = [];

    let buffer: string[] = [];
    let startLine = 0;
    let index = 0;


    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        buffer.push(line);

        const joined = buffer.join("\n");

        if (joined.length >= maxChars) {
            chunks.push({
                text: joined,
                index,
                startLine,
                endLine: i,
            });

            index++;
            startLine = Math.max(0, i - overlap/50); // overlap is 200, so we need to subtract 200/50 = 4 lines
            buffer = buffer.slice(overlap/50); // overlap is 200, so we need to subtract 200/50 = 4 lines
        }
    }

    if (buffer.length > 0) {
        chunks.push({
            text: buffer.join("\n"),
            index,
            startLine,
            endLine: lines.length - 1,
        });
    }
    return chunks;
}