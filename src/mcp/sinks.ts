// Per-call output buffers for `testlane mcp` (ADR-003). Each tool call gets its
// own, so concurrent calls never share stdout, and stdout stays the protocol's.

import { StringDecoder } from "node:string_decoder";
import type { Sink } from "../lib/log.ts";

/** Keeps everything written to it. With `tee`, also passes each chunk on. */
export class BufferSink implements Sink {
  private readonly chunks: Buffer[] = [];

  constructor(private readonly tee?: Sink) {}

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk));
    this.tee?.write(chunk);
    return true;
  }

  once(): this {
    return this;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

/**
 * Keeps the first `maxBytes` bytes and drops the rest, but keeps accepting
 * writes, so a child process writing to it never blocks on a full pipe.
 */
export class CappedSink implements Sink {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;

  constructor(private readonly maxBytes: number) {}

  write(chunk: string | Uint8Array): boolean {
    const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    const room = this.maxBytes - this.size;
    if (buf.length > room) this.truncated = true;
    if (room > 0) {
      const kept = buf.length > room ? buf.subarray(0, room) : buf;
      this.chunks.push(kept);
      this.size += kept.length;
    }
    return true;
  }

  once(): this {
    return this;
  }

  /** What was kept. When truncated, it ends at the last whole line that fit. */
  text(): string {
    const all = Buffer.concat(this.chunks);
    if (!this.truncated) return all.toString("utf8");
    const nl = all.lastIndexOf(0x0a);
    if (nl !== -1) return all.subarray(0, nl + 1).toString("utf8");
    // One long line: cut it, and drop a character the cut split in two.
    return new StringDecoder("utf8").write(all);
  }
}

/** Keeps only the last `n` lines written to it, so memory stays bounded. */
export class TailSink implements Sink {
  private readonly decoder = new StringDecoder("utf8");
  private readonly lines: string[] = [];
  private partial = "";

  constructor(private readonly n: number) {}

  write(chunk: string | Uint8Array): boolean {
    const text = this.partial + (typeof chunk === "string" ? chunk : this.decoder.write(Buffer.from(chunk)));
    const parts = text.split("\n");
    this.partial = parts.pop()!;
    for (const line of parts) {
      this.lines.push(line);
      if (this.lines.length > this.n) this.lines.shift();
    }
    return true;
  }

  once(): this {
    return this;
  }

  /** The last `n` lines, each with its newline; an unterminated last line counts as one. */
  text(): string {
    const partial = this.partial + this.decoder.end();
    const lines = partial === "" ? this.lines : [...this.lines, partial];
    const kept = lines.slice(-this.n);
    if (kept.length === 0) return "";
    return kept.join("\n") + (partial === "" ? "\n" : "");
  }
}
