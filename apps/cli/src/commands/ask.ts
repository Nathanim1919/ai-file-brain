import {
    banner, accent, dim, muted, highlight, warning,
    icons,
} from "../../../../packages/cli-ui/index.js";

export const handleAsk = async (query: string) => {
    banner();
    console.log(`  ${icons.brain} ${highlight("AI Ask")} ${dim("— chat with your files")}`);
    console.log(`  ${dim("Query:")} ${accent(`"${query}"`)}\n`);

    console.log(`  ${icons.warn} ${warning("Coming soon!")} This feature is under development.`);
    console.log(`  ${muted("In the meantime, try:")}`);
    console.log(`    ${accent("ai find")} ${dim("<query>")}    ${dim("— semantic search")}`);
    console.log(`    ${accent("ai search")} ${dim("<query>")}  ${dim("— keyword search")}`);
    console.log();
};
