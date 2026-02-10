import type { SearchQuery } from "./search.types.js";



export const parseSearchChArgs = (args: string[]): SearchQuery => {
    const query: SearchQuery = {};

    for (const arg of args) {
        if (arg.startsWith("--ext=")) {
            query.extension = arg.split("=")[1];
        } else if (arg.startsWith("--min-size=")) {
            query.minSize = parseSize(arg.split("=")[1] ?? "0");
        } else if (arg.startsWith("--max-size=")) {
            query.maxSize = parseSize(arg.split("=")[1] ?? "0");
        } else if (arg.startsWith("--recent=")) {
            query.recentDays = parseInt(arg.split("=")[1] ?? "0");
        } else if (arg.startsWith("--dir=")) {
            query.dir = arg.split("=")[1];
        }
        else {
            query.text = arg;
        }
    }
    return query;
}


const parseSize = (input: string): number => {
    const value = parseFloat(input);

    if (input.toLowerCase().includes("mb")) return value * 1024 * 1024;
    if (input.toLowerCase().includes("kb")) return value * 1024;
    if (input.toLowerCase().includes("gb")) return value * 1024 * 1024 * 1024;
    if (input.toLowerCase().includes("tb")) return value * 1024 * 1024 * 1024 * 1024;
    if (input.toLowerCase().includes("pb")) return value * 1024 * 1024 * 1024 * 1024 * 1024;
    if (input.toLowerCase().includes("eb")) return value * 1024 * 1024 * 1024 * 1024 * 1024 * 1024;
    if (input.toLowerCase().includes("zb")) return value * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024;
    if (input.toLowerCase().includes("yb")) return value * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024;
    return value;
} 
