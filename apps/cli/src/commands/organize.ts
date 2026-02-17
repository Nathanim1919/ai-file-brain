import {
    banner, accent, dim, muted, highlight, warning,
    icons,
} from "../../../../packages/cli-ui/index.js";

export const handleOrganize = async (folder: string) => {
    banner();
    console.log(`  ${icons.folder} ${highlight("Organize")} ${dim("— AI-powered file organization")}`);
    console.log(`  ${dim("Target:")} ${accent(folder)}\n`);

    console.log(`  ${icons.warn} ${warning("Coming soon!")} This feature is under development.`);
    console.log(`  ${muted("In the meantime, try:")}`);
    console.log(`    ${accent("ai find")} ${dim("<query>")}    ${dim("— semantic search")}`);
    console.log(`    ${accent("ai search")} ${dim("<query>")}  ${dim("— keyword search")}`);
    console.log();
};
