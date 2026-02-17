/**
 * 🦙 Ollama — Shared helpers for interacting with the local Ollama server.
 *
 * Used by setup, stats, and any future command that needs Ollama status.
 */

const OLLAMA_BASE_URL = "http://localhost:11434";

/** Check if the Ollama server is running by pinging the tags endpoint. */
export async function isOllamaRunning(): Promise<boolean> {
    try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export interface OllamaModel {
    name: string;
    size: number;
}

/** Get list of installed Ollama models with their sizes. */
export async function getInstalledModels(): Promise<OllamaModel[]> {
    try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!res.ok) return [];
        const data = (await res.json()) as { models?: { name: string; size: number }[] };
        return (data.models ?? []).map((m) => ({
            name: m.name,
            size: m.size,
        }));
    } catch {
        return [];
    }
}

/** Get just the model names (without tags like :latest). */
export async function getInstalledModelNames(): Promise<string[]> {
    const models = await getInstalledModels();
    return models.map((m) => m.name.split(":")[0]!);
}

