#!/usr/bin/env node

/**
 * 🧠 AI File Brain — CLI Entry Point
 * 
 * This thin wrapper uses tsx to run the TypeScript CLI.
 * After `npm link`, you can use: ai scan, ai find, ai search, etc.
 */

import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(__dirname, "..", "apps", "cli", "src", "index.ts");

try {
    execFileSync(
        "npx",
        ["tsx", cliEntry, ...process.argv.slice(2)],
        {
            stdio: "inherit",
            cwd: path.resolve(__dirname, ".."),
        }
    );
} catch (err) {
    // tsx already printed the error — just forward the exit code
    process.exit(err.status ?? 1);
}

