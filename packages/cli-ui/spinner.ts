/**
 * 🎡 AI File Brain — Spinner Service
 * Wraps ora for consistent spinner behavior across the CLI.
 */
import ora, { type Ora } from "ora";
import { brand, dim } from "./theme.js";

export class Spinner {
    private spinner: Ora;

    constructor(text: string) {
        this.spinner = ora({
            text: brand(text),
            spinner: "dots12",
            color: "magenta",
        });
    }

    start(text?: string): this {
        if (text) this.spinner.text = brand(text);
        this.spinner.start();
        return this;
    }

    update(text: string): this {
        this.spinner.text = brand(text);
        return this;
    }

    succeed(text: string): this {
        this.spinner.succeed(brand(text));
        return this;
    }

    warn(text: string): this {
        this.spinner.warn(text);
        return this;
    }

    fail(text: string): this {
        this.spinner.fail(text);
        return this;
    }

    info(text: string): this {
        this.spinner.info(dim(text));
        return this;
    }

    stop(): this {
        this.spinner.stop();
        return this;
    }
}

/** Convenience: create + start a spinner in one call */
export const spin = (text: string) => new Spinner(text).start();

