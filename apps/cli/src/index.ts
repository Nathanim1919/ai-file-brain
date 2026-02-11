#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { handleScan } from "./commands/scan.js";
import { handleFind } from "./commands/find.js";
import { handleOrganize } from "./commands/organize.js";
import { handleAsk } from "./commands/ask.js";
import { handleStats } from "./commands/stats.js";
import { runSearchCommand } from "./commands/search.js";

const brand = chalk.hex("#7C3AED");
const accent = chalk.hex("#06B6D4");
const dim = chalk.gray;
const hl = chalk.white.bold;

const program = new Command();

program
    .name("ai")
    .description("Local AI-powered file assistant")
    .version("1.0.0")
    .configureHelp({
        formatHelp: (cmd, helper) => {
            // If this is a subcommand, use Commander's default formatting
            if (cmd.parent) {
                const lines: string[] = [];
                lines.push("");
                lines.push(`  ${hl(cmd.name())} ${dim("— " + cmd.description())}`);
                lines.push("");

                const usage = helper.commandUsage(cmd);
                lines.push(`  ${hl("Usage:")} ${accent(usage)}`);
                lines.push("");

                const opts = cmd.options;
                if (opts.length > 0) {
                    lines.push(`  ${hl("Options:")}`);
                    for (const opt of opts) {
                        lines.push(`    ${accent(opt.flags)}  ${dim(opt.description ?? "")}`);
                    }
                    lines.push("");
                }

                return lines.join("\n");
            }

            // Root command — show full branded help
            const lines: string[] = [];

            lines.push("");
            lines.push(brand("  ╔══════════════════════════════════════╗"));
            lines.push(brand("  ║") + hl("   🧠 AI File Brain                  ") + brand("║"));
            lines.push(brand("  ╚══════════════════════════════════════╝"));
            lines.push("");
            lines.push(`  ${dim("Local AI-powered file assistant")}`);
            lines.push(`  ${dim("Version")} ${accent("1.0.0")}`);
            lines.push("");

            // Commands section
            lines.push(`  ${hl("Commands:")}`);
            lines.push(`  ${dim("─".repeat(50))}`);
            lines.push("");

            const commands = [
                { cmd: "scan", flags: "[--fresh]", desc: "Scan and index files with AI embeddings", icon: "🔎" },
                { cmd: "search <query>", flags: "", desc: "Keyword search (FTS5 full-text)", icon: "🔍" },
                { cmd: "find <query>", flags: "", desc: "Semantic search (AI-powered vector search)", icon: "✨" },
                { cmd: "organize <path>", flags: "", desc: "Organize files in folders", icon: "📂" },
                { cmd: "ask <query>", flags: "", desc: "Ask AI about your files", icon: "💬" },
                { cmd: "stats", flags: "", desc: "Show index statistics", icon: "📊" },
            ];

            for (const c of commands) {
                const cmdStr = accent(`ai ${c.cmd}`);
                const flagStr = c.flags ? ` ${dim(c.flags)}` : "";
                lines.push(`  ${c.icon}  ${cmdStr}${flagStr}`);
                lines.push(`      ${dim(c.desc)}`);
                lines.push("");
            }

            // Examples section
            lines.push(`  ${hl("Examples:")}`);
            lines.push(`  ${dim("─".repeat(50))}`);
            lines.push("");
            lines.push(`  ${dim("$")} ${accent("ai scan")}                ${dim("# Index your files")}`);
            lines.push(`  ${dim("$")} ${accent("ai scan --fresh")}        ${dim("# Wipe & rescan from scratch")}`);
            lines.push(`  ${dim("$")} ${accent('ai search "report"')}     ${dim("# Keyword search")}`);
            lines.push(`  ${dim("$")} ${accent('ai find "ML papers"')}    ${dim("# AI semantic search")}`);
            lines.push("");

            return lines.join("\n");
        },
    });


program
    .command("scan")
    .description("Scan and index files")
    .option("--fresh", "Clear all indexes and rescan from scratch")
    .action((opts) => handleScan({ fresh: opts.fresh }));


program
    .command("search <query...>")
    .description("Search for files")
    .action(runSearchCommand);


program
    .command("find <query...>")
    .description("Semantic search for files (AI-powered)")
    .action((args: string[]) => handleFind(args.join(" ")));


program
    .command("organize <folder>")
    .description("Organize files in folders")
    .action(handleOrganize);


program
    .command("ask <query>")
    .description("Ask AI about files")
    .action(handleAsk);


program
    .command("stats")
    .description("Show stats")
    .action(handleStats);


program.parse();
