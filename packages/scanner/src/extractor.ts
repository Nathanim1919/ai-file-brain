/**
 * Content extractor — reads text from files based on their type.
 * 
 * Supported:
 *   - Plain text (.txt, .md, .csv, .json, .html, etc.) → direct UTF-8 read
 *   - PDF (.pdf) → pdf-parse
 *   - DOCX (.docx) → mammoth
 */

import fs from "fs/promises";
import path from "path";

/** Extensions we can read directly as UTF-8 */
const PLAIN_TEXT_EXTENSIONS = new Set([
    ".txt", ".md", ".rst", ".org",
    ".csv", ".tsv",
    ".json", ".html", ".htm",
    ".tex", ".rtf",
    ".eml", ".msg",
]);

/** Extensions that need a parser */
const PARSEABLE_EXTENSIONS = new Set([
    ".pdf",
    ".docx",
]);

/**
 * Returns true if we can extract text content from this file type.
 */
export function isExtractable(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return PLAIN_TEXT_EXTENSIONS.has(ext) || PARSEABLE_EXTENSIONS.has(ext);
}

/**
 * Extract text content from a file.
 * Returns empty string if extraction fails or file type is unsupported.
 */
export async function extractContent(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    try {
        // Plain text — direct read
        if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
            return await fs.readFile(filePath, "utf-8");
        }

        // PDF — use pdf-parse
        if (ext === ".pdf") {
            return await extractPdf(filePath);
        }

        // DOCX — use mammoth
        if (ext === ".docx") {
            return await extractDocx(filePath);
        }
    } catch {
        // extraction failed — skip silently
    }

    return "";
}


async function extractPdf(filePath: string): Promise<string> {
    // Silence noisy PDF parser warnings (standardFontDataUrl, TT: undefined function, etc.)
    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = () => {};
    console.error = () => {};

    try {
        const { PDFParse } = await import("pdf-parse");
        const buffer = await fs.readFile(filePath);
        const uint8 = new Uint8Array(buffer);
        const parser = new PDFParse(uint8);
        await parser.load();
        const result = await parser.getText();

        // v2 API returns { pages: [{ text: string }, ...] }
        if (result && typeof result === "object" && "pages" in result) {
            const pages = (result as { pages: { text: string }[] }).pages;
            return pages.map(p => p.text).join("\n");
        }

        return typeof result === "string" ? result : "";
    } finally {
        console.warn = originalWarn;
        console.error = originalError;
    }
}


async function extractDocx(filePath: string): Promise<string> {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
}

