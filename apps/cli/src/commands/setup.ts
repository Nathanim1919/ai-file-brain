/**
 * 🚀 ai setup — First-run setup wizard
 *
 * Flow:
 *   1. Check if Ollama is installed → if not, ask to download
 *   2. Check if Ollama is running → if not, start it
 *   3. Pull required models (nomic-embed-text)
 *   4. Show success / error
 *   5. Ask to scan files → run scan + embed
 *   6. Show --help so user knows what's available
 */

import { execSync, spawn } from "child_process";
import readline from "readline";
import {
    banner, brand, accent, success, warning, error as errorStyle, dim, muted, highlight,
    icons, line, summaryBox,
    spin,
} from "../../../../packages/cli-ui/index.js";
import { handleScan } from "./scan.js";

// ─── Required Ollama models ────────────────────────────────
const REQUIRED_MODELS = [
    { name: "nomic-embed-text", purpose: "embedding files for semantic search" },
];

// ─── Helpers ───────────────────────────────────────────────

/** Prompt the user with a yes/no question. Returns true for yes. */
function ask(question: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(`  ${icons.brain} ${highlight(question)} ${dim("(y/n)")} `, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase().startsWith("y"));
        });
    });
}

/** Check if a command exists on the system. */
function commandExists(cmd: string): boolean {
    try {
        execSync(`which ${cmd}`, { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

/** Check if Ollama server is running by pinging it. */
async function isOllamaRunning(): Promise<boolean> {
    try {
        const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

/** Get list of installed Ollama models. */
async function getInstalledModels(): Promise<string[]> {
    try {
        const res = await fetch("http://localhost:11434/api/tags");
        if (!res.ok) return [];
        const data = await res.json() as { models?: { name: string }[] };
        return (data.models ?? []).map((m) => m.name.split(":")[0]!);
    } catch {
        return [];
    }
}

/** Pull an Ollama model with live progress output. */
async function pullModel(modelName: string): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawn("ollama", ["pull", modelName], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        child.stdout.on("data", (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                // Overwrite current line with progress
                process.stdout.write(`\r  ${dim("│")} ${muted(text.slice(0, 70).padEnd(70))}`);
            }
        });

        child.stderr.on("data", (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                process.stdout.write(`\r  ${dim("│")} ${muted(text.slice(0, 70).padEnd(70))}`);
            }
        });

        child.on("close", (code) => {
            process.stdout.write("\r" + " ".repeat(80) + "\r"); // clear progress line
            resolve(code === 0);
        });

        child.on("error", () => {
            resolve(false);
        });
    });
}

/** Get the Ollama install command for the current platform. */
function getOllamaInstallCommand(): string {
    const platform = process.platform;
    if (platform === "linux") {
        return "curl -fsSL https://ollama.com/install.sh | sh";
    } else if (platform === "darwin") {
        return "brew install ollama";
    } else {
        return "Visit https://ollama.com/download";
    }
}


// ─── Main Setup Command ────────────────────────────────────

export const handleSetup = async () => {
    banner();
    console.log(`  ${icons.rocket} ${highlight("Setup Wizard")} ${dim("— let's get everything ready")}`);
    console.log(`  ${dim("─".repeat(50))}\n`);

    let stepNum = 1;
    const step = (text: string) => {
        console.log(`  ${accent(`Step ${stepNum}:`)} ${text}`);
        stepNum++;
    };

    // ═══════════════════════════════════════════════════════════
    //  Step 1: Check if Ollama is installed
    // ═══════════════════════════════════════════════════════════
    step("Checking if Ollama is installed...");

    const ollamaInstalled = commandExists("ollama");

    if (!ollamaInstalled) {
        console.log(`  ${icons.fail} ${errorStyle("Ollama is not installed.")}\n`);

        const installCmd = getOllamaInstallCommand();
        console.log(`  ${dim("To install Ollama, run:")}`);
        console.log(`  ${accent(installCmd)}\n`);

        const shouldInstall = await ask("Would you like me to install Ollama for you?");

        if (!shouldInstall) {
            console.log(`\n  ${icons.warn} ${warning("Setup cancelled.")} Install Ollama manually and run ${accent("ai setup")} again.`);
            return;
        }

        // Install Ollama
        const installSpinner = spin("Installing Ollama...");
        try {
            if (process.platform === "linux") {
                execSync("curl -fsSL https://ollama.com/install.sh | sh", {
                    stdio: "inherit",
                });
            } else if (process.platform === "darwin") {
                execSync("brew install ollama", { stdio: "inherit" });
            } else {
                installSpinner.fail("Automatic install not supported on this platform.");
                console.log(`  ${dim("Please install manually from:")} ${accent("https://ollama.com/download")}`);
                return;
            }
            installSpinner.succeed("Ollama installed successfully");
        } catch {
            installSpinner.fail("Failed to install Ollama");
            console.log(`  ${dim("Try installing manually:")} ${accent(installCmd)}`);
            return;
        }
    } else {
        console.log(`  ${icons.check} ${success("Ollama is installed")}\n`);
    }

    // ═══════════════════════════════════════════════════════════
    //  Step 2: Check if Ollama is running
    // ═══════════════════════════════════════════════════════════
    step("Checking if Ollama is running...");

    let running = await isOllamaRunning();

    if (!running) {
        console.log(`  ${icons.warn} ${warning("Ollama is not running. Starting it...")}`);

        // Start Ollama in the background
        const child = spawn("ollama", ["serve"], {
            stdio: "ignore",
            detached: true,
        });
        child.unref();

        // Wait a few seconds for it to start
        const startSpinner = spin("Waiting for Ollama to start...");
        for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            running = await isOllamaRunning();
            if (running) break;
        }

        if (running) {
            startSpinner.succeed("Ollama is running");
        } else {
            startSpinner.fail("Could not start Ollama");
            console.log(`  ${dim("Try starting it manually:")} ${accent("ollama serve")}`);
            return;
        }
    } else {
        console.log(`  ${icons.check} ${success("Ollama is running")}\n`);
    }

    // ═══════════════════════════════════════════════════════════
    //  Step 3: Check & pull required models
    // ═══════════════════════════════════════════════════════════
    step("Checking required AI models...\n");

    const installedModels = await getInstalledModels();

    for (const model of REQUIRED_MODELS) {
        const isInstalled = installedModels.includes(model.name);

        if (isInstalled) {
            console.log(`  ${icons.check} ${success(model.name)} ${dim(`— ${model.purpose}`)}`);
        } else {
            console.log(`  ${icons.warn} ${warning(model.name)} ${dim(`— ${model.purpose} (not installed)`)}`);

            const shouldPull = await ask(`Download ${model.name}?`);

            if (!shouldPull) {
                console.log(`  ${icons.skip} Skipped ${model.name}`);
                continue;
            }

            const pullSpinner = spin(`Pulling ${model.name}...`);
            const pulled = await pullModel(model.name);

            if (pulled) {
                pullSpinner.succeed(`${model.name} ready`);
            } else {
                pullSpinner.fail(`Failed to pull ${model.name}`);
                console.log(`  ${dim("Try manually:")} ${accent(`ollama pull ${model.name}`)}`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Step 4: Verify everything works
    // ═══════════════════════════════════════════════════════════
    console.log();
    step("Verifying setup...");

    const verifySpinner = spin("Testing embedding service...");
    try {
        const res = await fetch("http://localhost:11434/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "nomic-embed-text",
                input: ["test"],
            }),
        });

        if (res.ok) {
            verifySpinner.succeed("Embedding service is working");
        } else {
            verifySpinner.fail("Embedding service returned an error");
            console.log(`  ${dim("Make sure nomic-embed-text is installed:")} ${accent("ollama pull nomic-embed-text")}`);
            return;
        }
    } catch {
        verifySpinner.fail("Could not connect to Ollama");
        console.log(`  ${dim("Make sure Ollama is running:")} ${accent("ollama serve")}`);
        return;
    }

    // ═══════════════════════════════════════════════════════════
    //  ✅ Setup complete!
    // ═══════════════════════════════════════════════════════════
    console.log();
    console.log(`  ${icons.sparkle} ${success("Setup complete!")} Everything is ready.\n`);

    // ═══════════════════════════════════════════════════════════
    //  Step 5: Ask to scan files
    // ═══════════════════════════════════════════════════════════
    const shouldScan = await ask("Would you like to scan and index your files now?");

    if (shouldScan) {
        console.log();
        await handleScan({ fresh: true });
    } else {
        console.log(`\n  ${dim("You can scan later with:")} ${accent("ai scan")}\n`);
    }

    // ═══════════════════════════════════════════════════════════
    //  Step 6: Show available commands
    // ═══════════════════════════════════════════════════════════
    console.log();
    console.log(`  ${icons.rocket} ${highlight("You're all set! Here's what you can do:")}`);
    console.log(`  ${dim("─".repeat(50))}\n`);

    const commands = [
        { cmd: "ai scan", desc: "Scan and index your files", icon: "🔎" },
        { cmd: "ai scan --fresh", desc: "Wipe & rescan from scratch", icon: "🔎" },
        { cmd: 'ai find "query"', desc: "Semantic search (AI-powered)", icon: "✨" },
        { cmd: 'ai search "query"', desc: "Keyword search (FTS5)", icon: "🔍" },
        { cmd: "ai stats", desc: "Show index statistics", icon: "📊" },
        { cmd: "ai --help", desc: "See all commands", icon: "💡" },
    ];

    for (const c of commands) {
        console.log(`  ${c.icon}  ${accent(c.cmd)}`);
        console.log(`      ${dim(c.desc)}`);
        console.log();
    }

    console.log(`  ${dim("Happy searching!")} ${icons.brain}\n`);
};

