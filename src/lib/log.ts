// Logger: stderr steps, levels, color gating (§13).

import pc from "picocolors";

/**
 * Where a verb writes its output. `process.stdout` and `process.stderr` are
 * sinks; `testlane mcp` gives each tool call buffers of its own (ADR-003).
 */
export interface Sink {
  write(chunk: string | Uint8Array): boolean;
  once(event: "drain", listener: () => void): unknown;
}

export type LogLevel = "step" | "debug" | "warn";

export interface LoggerOptions {
  quiet: boolean;
  verbose: boolean;
  color: boolean;
  /** Where log lines go. Defaults to `process.stderr`. */
  sink?: Sink;
  /** Called with each line the logger prints, after it prints it. */
  onLine?: (level: LogLevel, message: string) => void;
}

export class Logger {
  private readonly quiet: boolean;
  private readonly verbose_: boolean;
  private readonly color: boolean;
  private readonly sink: Sink | undefined;
  private readonly onLine: LoggerOptions["onLine"];

  constructor(opts: LoggerOptions) {
    this.quiet = opts.quiet;
    this.verbose_ = opts.verbose;
    this.color = opts.color;
    this.sink = opts.sink;
    this.onLine = opts.onLine;
  }

  private dim(s: string): string {
    return this.color ? pc.dim(s) : s;
  }

  /** Text written as is, at every level: a log tail or a plan listing. */
  write(text: string): void {
    (this.sink ?? process.stderr).write(text);
  }

  /** One `→`-prefixed step line on stderr. Silenced by --quiet. */
  step(message: string): void {
    if (this.quiet) return;
    this.write(`${this.dim("→")} ${message}\n`);
    this.onLine?.("step", message);
  }

  /** Verbose-only detail (e.g. external command + timing). */
  debug(message: string): void {
    if (!this.verbose_) return;
    this.write(`${this.dim("·")} ${message}\n`);
    this.onLine?.("debug", message);
  }

  /** Warnings always print, even under --quiet. */
  warn(message: string): void {
    const label = this.color ? pc.yellow("warning") : "warning";
    this.write(`${label}: ${message}\n`);
    this.onLine?.("warn", message);
  }

  get isVerbose(): boolean {
    return this.verbose_;
  }

  get isQuiet(): boolean {
    return this.quiet;
  }
}

/**
 * Decide whether ANSI color is allowed: honors --no-color, NO_COLOR env,
 * and a non-TTY stderr (§13.3).
 */
export function colorEnabled(noColorFlag: boolean): boolean {
  if (noColorFlag) return false;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  return Boolean(process.stderr.isTTY);
}
