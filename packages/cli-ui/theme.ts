/**
 * 🎨 AI File Brain — CLI Theme
 * Centralized colors, icons, and styling constants.
 */
import chalk from "chalk";

// ─── Brand Colors ──────────────────────────────────────────
export const brand = chalk.hex("#7C3AED");       // purple — primary brand
export const accent = chalk.hex("#06B6D4");       // cyan — accents
export const success = chalk.hex("#22C55E");      // green
export const warning = chalk.hex("#F59E0B");      // amber
export const error = chalk.hex("#EF4444");        // red
export const dim = chalk.gray;
export const muted = chalk.hex("#6B7280");        // gray-500
export const highlight = chalk.white.bold;
export const subtle = chalk.hex("#9CA3AF");       // gray-400

// ─── Phase Icons ───────────────────────────────────────────
export const icons = {
    brain: "🧠",
    scan: "🔎",
    folder: "📂",
    file: "📄",
    chunk: "🧩",
    embed: "🔗",
    vector: "💎",
    bolt: "⚡",
    check: "✅",
    warn: "⚠️ ",
    fail: "❌",
    skip: "⏭️ ",
    clock: "⏱️ ",
    star: "⭐",
    tag: "🏷️",
    gear: "⚙️",
    rocket: "🚀",
    search: "🔍",
    sparkle: "✨",
} as const;

// ─── Box Drawing ───────────────────────────────────────────
export const line = (width = 60) => dim("━".repeat(width));
export const thinLine = (width = 60) => dim("─".repeat(width));

// ─── Header / Banner ──────────────────────────────────────
export const banner = () => {
    console.log();
    console.log(brand("  ╔══════════════════════════════════════╗"));
    console.log(brand("  ║") + highlight("   🧠 AI File Brain                  ") + brand("║"));
    console.log(brand("  ╚══════════════════════════════════════╝"));
    console.log();
};

// ─── Section Header ────────────────────────────────────────
export const sectionHeader = (title: string) => {
    console.log();
    console.log(`  ${brand("▸")} ${highlight(title)}`);
    console.log(`  ${dim("─".repeat(title.length + 2))}`);
};

// ─── Metric Line ───────────────────────────────────────────
export const metric = (label: string, value: string | number, icon?: string) => {
    const prefix = icon ? `${icon} ` : "  ";
    console.log(`  ${prefix}${muted(label)} ${highlight(String(value))}`);
};

// ─── Summary Box ───────────────────────────────────────────
export const summaryBox = (metrics: { label: string; value: string | number; icon?: string }[]) => {
    console.log();
    console.log(`  ${line(44)}`);
    for (const m of metrics) {
        metric(m.label, m.value, m.icon);
    }
    console.log(`  ${line(44)}`);
    console.log();
};

