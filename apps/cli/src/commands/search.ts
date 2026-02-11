import { SearchRepository } from "../../../core/repositories/search.repository.js";
import path from "path";
import {
    banner, brand, accent, success, warning, error as errorColor, dim, muted, highlight, subtle,
    icons, line, summaryBox,
    spin,
} from "../../../../packages/cli-ui/index.js";

const searchRepository = new SearchRepository();

export async function runSearchCommand(args: string[]) {
    const query = args.join(" ");

    banner();
    console.log(`  ${icons.search} ${highlight("Keyword Search")} ${dim("— FTS5 full-text search")}`);
    console.log(`  ${dim("Query:")} ${accent(`"${query}"`)}\n`);

    const searchSpinner = spin("Searching indexed files...");

    const startTime = Date.now();
    const results = searchRepository.search(query) as SearchResult[];
    const elapsed = Date.now() - startTime;

    if (results.length === 0) {
        searchSpinner.fail("No results found");
        console.log(`\n  ${dim("Try a different keyword, or run")} ${accent("ai scan")} ${dim("to index more files.")}\n`);
        return;
    }

    searchSpinner.succeed(`Found ${results.length} files ${dim(`(${elapsed}ms)`)}`);

    // Normalize scores: map to 0–1 range relative to best result
    const maxScore = Math.max(...results.map(r => r.score ?? 0));

    console.log();
    console.log(`  ${line(56)}`);
    console.log(`  ${icons.star} ${highlight(`${results.length} results`)} ${muted(`for "${query}"`)}`);
    console.log(`  ${line(56)}`);

    let rank = 1;
    for (const file of results) {
        const fileName = file.name;
        const dir = path.dirname(file.path);
        const rawScore = file.score ?? 0;
        const normalizedScore = maxScore > 0 ? rawScore / maxScore : 0;

        // Visual relevance bar
        const barLen = Math.round(normalizedScore * 20);
        const bar = brand("█".repeat(barLen)) + dim("░".repeat(20 - barLen));

        const rankColor = rank <= 3 ? highlight : muted;

        // Snippet: show content match if available, otherwise skip
        const snippet = file.snippet?.trim();

        console.log();
        console.log(`  ${rankColor(`${rank}.`)} ${icons.file} ${highlight(fileName)}`);
        console.log(`     ${dim(dir)}`);
        console.log(`     ${bar} ${brand((normalizedScore * 100).toFixed(0) + "%")} ${dim(`(BM25: ${rawScore.toFixed(6)})`)}`);

        if (snippet) {
            // Highlight matched terms within [brackets] from FTS5 snippet
            const styled = snippet.replace(/\[([^\]]+)\]/g, (_m, term) => accent(term));
            console.log(`     ${subtle(`"${styled}"`)}`);
        }

        rank++;
    }

    // Summary
    summaryBox([
        { label: "Results:",    value: results.length, icon: icons.file },
        { label: "Search time:", value: `${elapsed}ms`, icon: icons.bolt },
    ]);
}

interface SearchResult {
    id: number;
    name: string;
    path: string;
    size: number;
    created_at: string;
    modified_at: string;
    score: number;
    snippet: string;
}
