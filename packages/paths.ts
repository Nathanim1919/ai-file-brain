/**
 * Central path resolver for all AI File Brain data.
 *
 * Everything lives under ~/.ai-file-brain/ so the CLI
 * and future desktop app work from any working directory.
 */

import path from "path";
import os from "os";
import fs from "fs";

export const DATA_DIR = path.join(os.homedir(), ".ai-file-brain");
export const DB_PATH = path.join(DATA_DIR, "filebrain.db");
export const VECTORS_DIR = path.join(DATA_DIR, "vectors");
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");

/**
 * Ensure the data directory exists. Called once on startup.
 * Also copies config.example.json into ~/.ai-file-brain/config.json
 * on first run so the user has a starting config to edit.
 */
export function ensureDataDir(projectRoot?: string): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        // Try to find config.example.json relative to the project root
        const candidates = [
            projectRoot ? path.join(projectRoot, "config.example.json") : "",
            path.join(process.cwd(), "config.example.json"),
            path.resolve(import.meta.dirname ?? ".", "..", "config.example.json"),
        ].filter(Boolean);

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                fs.copyFileSync(candidate, CONFIG_PATH);
                return;
            }
        }

        // No example found — create a minimal default config
        const defaultConfig = {
            allowedPaths: [
                path.join(os.homedir(), "Documents"),
                path.join(os.homedir(), "Downloads"),
                path.join(os.homedir(), "Desktop"),
            ],
            allowedExtensions: [
                ".pdf", ".doc", ".docx", ".odt", ".rtf", ".tex",
                ".xls", ".xlsx", ".csv", ".tsv",
                ".ppt", ".pptx",
                ".txt", ".md", ".rst", ".org",
                ".html", ".htm", ".json",
                ".eml", ".msg",
            ],
            projectMarkerFiles: [
                "pom.xml", "build.gradle", "package.json", "Cargo.toml",
                "go.mod", "CMakeLists.txt", "Makefile", "setup.py",
                "pyproject.toml", "requirements.txt",
            ],
            ignoredDirs: [
                "node_modules", "target", "build", "dist", "out",
                "bin", "obj", "vendor", "venv", ".venv",
                "tmp", "temp", "logs", ".Trash", "snap",
            ],
            ignoredFiles: ["thumbs.db", ".DS_Store"],
        };

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 4) + "\n");
    }
}
