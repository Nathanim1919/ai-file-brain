import { parseSearchChArgs } from "../../../../packages/search/search.parser.js";
import { searchFiles } from "../../../../packages/search/search.service.js";
import { SearchRepository } from "../../../core/repositories/search.repository.js";

const searchRepository = new SearchRepository();

export async function runSearchCommand(args: string[]) {

    const query = args.join(" ");
    const results = searchRepository.search(query);


    for (const file of results) {

        const sizeMB = (file.size / (1024 * 1025)).toFixed(2);

        console.log(`📄 ${file.name}`);
        console.log(`📁 ${file.path}`);
        console.log(`⭐ score: ${file.score}`);
        console.log(`🔎 ${file.snippet}`);
        console.log("");


    }

    console.log(`✅ ${results.length} results`);

}