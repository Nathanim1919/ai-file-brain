/**
 * 📊 AI File Brain — Progress Bar Service
 * Wraps cli-progress for animated progress bars.
 */
import cliProgress from "cli-progress";
import { brand, dim, accent, success, muted } from "./theme.js";

export interface ProgressBarOptions {
    label?: string;
    showSpeed?: boolean;
    showETA?: boolean;
}

export class ProgressBar {
    private bar: cliProgress.SingleBar;
    private startTime = 0;

    constructor(total: number, options: ProgressBarOptions = {}) {
        const label = options.label ?? "Progress";
        const formatStr = [
            `  ${accent("{icon}")}`,
            `${muted(label)}`,
            `${brand("{bar}")}`,
            `{percentage}%`,
            dim("│"),
            `{value}/{total}`,
            options.showSpeed ? dim("│ {speed}/s") : "",
            options.showETA ? dim("│ ETA: {eta_formatted}") : "",
        ].filter(Boolean).join(" ");

        this.bar = new cliProgress.SingleBar({
            format: formatStr,
            barCompleteChar: "█",
            barIncompleteChar: "░",
            barsize: 20,
            hideCursor: true,
            clearOnComplete: false,
            stopOnComplete: true,
            forceRedraw: true,
        });

        this.bar.start(total, 0, {
            icon: "⏳",
            speed: "0",
        });
        this.startTime = Date.now();
    }

    increment(payload?: Record<string, string>): void {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const current = (this.bar as any).value + 1;
        const speed = elapsed > 0 ? (current / elapsed).toFixed(1) : "0";

        this.bar.increment({
            icon: "⚡",
            speed,
            ...payload,
        });
    }

    update(value: number, payload?: Record<string, string>): void {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const speed = elapsed > 0 ? (value / elapsed).toFixed(1) : "0";

        this.bar.update(value, {
            icon: "⚡",
            speed,
            ...payload,
        });
    }

    stop(): void {
        this.bar.stop();
    }
}

/**
 * Multi-bar for parallel phases (scanning + embedding simultaneously)
 */
export class MultiProgress {
    private multi: cliProgress.MultiBar;

    constructor() {
        this.multi = new cliProgress.MultiBar({
            format: `  {icon} ${muted("{label}")} ${brand("{bar}")} {percentage}% ${dim("│")} {value}/{total}`,
            barCompleteChar: "█",
            barIncompleteChar: "░",
            barsize: 20,
            hideCursor: true,
            clearOnComplete: false,
        });
    }

    addBar(label: string, total: number, icon = "📄"): cliProgress.SingleBar {
        return this.multi.create(total, 0, { label, icon });
    }

    stop(): void {
        this.multi.stop();
    }
}

