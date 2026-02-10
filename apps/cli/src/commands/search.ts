import { parseSearchChArgs } from "../../../../packages/search/search.parser.js";
import { searchFiles } from "../../../../packages/search/search.service.js";


export const runSearchCommand = (args: string[]) => {

    const query = parseSearchChArgs(args);
    const results = searchFiles(query);


    for (const file of results) {

        const sizeMB = (file.size / (1024 * 1025)).toFixed(2);

        console.log(`📄 ${file.name}`);
        console.log(`📁 ${file.path}`);
        console.log(`🕒 ${file.modified_at}`);
        console.log(`📦 ${sizeMB} MB`);
        console.log("");

    }

    console.log(`✅ ${results.length} results`);

}