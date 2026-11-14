// A hand-written MCP server over stdio (ADR-003): JSON-RPC 2.0, one message per
// line, with `initialize`, `ping`, `tools/list` and `tools/call`, and the
// `initialized`, `progress` and `cancelled` notifications.

import { createInterface } from "node:readline";
import { ABORT_GRACE_MS } from "../lib/proc.ts";
import type { Sink } from "../lib/log.ts";
import type { GhClient } from "../git/gh.ts";
import { DEFAULT_TIMEOUT_S, findTool, runTool, toolList, type Tool, type ToolResult } from "./tools.ts";

/** The protocol versions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

/** A heartbeat repeats the last step at least this often while a long call runs. */
export const HEARTBEAT_MS = 2_500;
/**
 * How long a stopped call may take to wind down before the server answers
 * anyway: the children's grace, then SIGKILL and a little slack.
 */
const SETTLE_CAP_MS = ABORT_GRACE_MS + 1_500;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type Id = string | number;

export interface ServerOptions {
  configDir: string;
  version: string;
  /** Where client messages arrive, one per line. */
  input: NodeJS.ReadableStream;
  /** Writes one protocol message line. The only writer of the server's stdout. */
  send(line: string): void;
  /** Where the server's own log lines go. Defaults to `process.stderr`. */
  stderr?: Sink;
  gh?: () => GhClient;
}

interface Call {
  controller: AbortController;
  /** Why the call was stopped, once it was. */
  stopped?: "timeout" | "cancel" | "shutdown";
  done: Promise<void>;
}

const isId = (v: unknown): v is Id => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Serve until the input ends or `stop()` is called. In-flight calls are then
 * stopped, and the promise settles once they have wound down.
 */
export class McpServer {
  private readonly calls = new Map<string, Call>();
  private closed = false;

  constructor(private readonly opts: ServerOptions) {}

  async serve(): Promise<void> {
    const rl = createInterface({ input: this.opts.input, crlfDelay: Infinity });
    const ended = new Promise<void>((resolve) => rl.once("close", resolve));
    this.stopInput = () => rl.close();
    rl.on("line", (line) => this.onLine(line));
    await ended;
    await this.shutdown();
  }

  /** End the session as if the input had ended. */
  stop(): void {
    this.stopInput();
  }

  private stopInput: () => void = () => {};

  private async shutdown(): Promise<void> {
    const pending = [...this.calls.values()];
    for (const call of pending) this.abort(call, "shutdown");
    await Promise.race([Promise.all(pending.map((c) => c.done)), sleep(SETTLE_CAP_MS)]);
    this.closed = true;
  }

  private write(message: object): void {
    if (this.closed) return;
    this.opts.send(JSON.stringify(message) + "\n");
  }

  private reply(id: Id | null, result: object): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private fail(id: Id | null, code: number, message: string): void {
    this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  private onLine(line: string): void {
    if (line.trim() === "") return;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      this.fail(null, PARSE_ERROR, "parse error: each line must be one JSON-RPC message");
      return;
    }
    if (Array.isArray(msg)) {
      this.fail(null, INVALID_REQUEST, "batches are not supported: send one message per line");
      return;
    }
    if (typeof msg !== "object" || msg === null) {
      this.fail(null, INVALID_REQUEST, "invalid request: expected a JSON-RPC 2.0 object");
      return;
    }
    const m = msg as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
    const id = isId(m.id) ? m.id : null;
    if (m.jsonrpc !== "2.0") {
      this.fail(id, INVALID_REQUEST, 'invalid request: "jsonrpc" must be "2.0"');
      return;
    }
    if (typeof m.method !== "string") {
      // A response to a request we never send, or junk: answer only a request.
      if ("id" in m && !("result" in m) && !("error" in m)) this.fail(id, INVALID_REQUEST, 'invalid request: "method" must be a string');
      return;
    }
    const params = typeof m.params === "object" && m.params !== null ? (m.params as Record<string, unknown>) : {};
    if (!("id" in m)) {
      this.onNotification(m.method, params);
      return;
    }
    if (id === null) {
      this.fail(null, INVALID_REQUEST, 'invalid request: "id" must be a string or a number');
      return;
    }
    this.onRequest(id, m.method, params);
  }

  private onNotification(method: string, params: Record<string, unknown>): void {
    if (method === "notifications/cancelled" && isId(params.requestId)) {
      const call = this.calls.get(key(params.requestId));
      if (call) this.abort(call, "cancel");
    }
    // `notifications/initialized` and anything else need no answer.
  }

  private onRequest(id: Id, method: string, params: Record<string, unknown>): void {
    switch (method) {
      case "initialize": {
        const asked = params.protocolVersion;
        const protocolVersion = (PROTOCOL_VERSIONS as readonly unknown[]).includes(asked)
          ? (asked as string)
          : PROTOCOL_VERSIONS[0];
        this.reply(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "testlane", version: this.opts.version },
        });
        return;
      }
      case "ping":
        this.reply(id, {});
        return;
      case "tools/list":
        this.reply(id, { tools: toolList() });
        return;
      case "tools/call":
        this.onToolCall(id, params);
        return;
      default:
        this.fail(id, METHOD_NOT_FOUND, `method not found: ${method}`);
    }
  }

  private onToolCall(id: Id, params: Record<string, unknown>): void {
    const name = params.name;
    const tool = typeof name === "string" ? findTool(name) : undefined;
    if (!tool) {
      this.fail(id, INVALID_PARAMS, `unknown tool: ${typeof name === "string" ? name : "(no name)"}`);
      return;
    }
    const k = key(id);
    if (this.calls.has(k)) {
      this.fail(id, INVALID_REQUEST, `request id ${JSON.stringify(id)} is already in use`);
      return;
    }
    const meta = typeof params._meta === "object" && params._meta !== null ? (params._meta as Record<string, unknown>) : {};
    const token = isId(meta.progressToken) ? meta.progressToken : undefined;

    const call: Call = { controller: new AbortController(), done: Promise.resolve() };
    this.calls.set(k, call);
    call.done = this.runCall(id, tool, params.arguments, call, token).finally(() => this.calls.delete(k));
  }

  private abort(call: Call, why: NonNullable<Call["stopped"]>): void {
    if (call.stopped) return;
    call.stopped = why;
    call.controller.abort();
  }

  private async runCall(id: Id, tool: Tool, args: unknown, call: Call, token: Id | undefined): Promise<void> {
    const progress = token !== undefined && tool.long ? new Progress((m) => this.write(m), token) : undefined;
    const timeoutS = timeoutOf(args);
    const deadline = tool.long && timeoutS !== undefined ? setTimeout(() => this.abort(call, "timeout"), timeoutS * 1000) : undefined;
    // A stopped call sends no more progress.
    const stopped = new Promise<void>((r) =>
      call.controller.signal.addEventListener("abort", () => (progress?.stop(), r()), { once: true }),
    );

    let stderrSoFar = "";
    const work = runTool(tool, args, {
      configDir: this.opts.configDir,
      signal: call.controller.signal,
      stderr: this.opts.stderr,
      gh: this.opts.gh,
      onLine: (level, message) => {
        stderrSoFar += `${level === "warn" ? "warning: " : "→ "}${message}\n`;
        if (level === "step") progress?.step(message);
      },
    });
    try {
      const first = await Promise.race([work, stopped.then(() => null)]);
      if (first && !call.stopped) {
        this.answer(id, first);
        return;
      }
      // Stopped: wait for the call's processes to wind down, then answer a
      // timeout. A cancelled call gets no answer (MCP's cancellation rule).
      const settled = await Promise.race([work, sleep(SETTLE_CAP_MS).then(() => null)]);
      if (call.stopped === "timeout") {
        const stderr = settled ? stderrOf(settled) ?? stderrSoFar : stderrSoFar;
        this.answer(id, {
          text: JSON.stringify({ timedOut: true, timeoutSeconds: timeoutS, stderr }),
          isError: true,
        });
      }
    } finally {
      if (deadline) clearTimeout(deadline);
      progress?.stop();
    }
  }

  private answer(id: Id, r: ToolResult): void {
    this.reply(id, { content: [{ type: "text", text: r.text }], isError: r.isError });
  }
}

/** Map key for a request id: `1` and `"1"` are different ids. */
function key(id: Id): string {
  return JSON.stringify(id);
}

/** The call's `timeout` in seconds, when it's valid; `runTool` reports one that isn't. */
function timeoutOf(args: unknown): number | undefined {
  if (typeof args !== "object" || args === null) return DEFAULT_TIMEOUT_S;
  const t = (args as Record<string, unknown>).timeout;
  if (t === undefined) return DEFAULT_TIMEOUT_S;
  return typeof t === "number" && Number.isFinite(t) && t > 0 ? t : undefined;
}

/** The `stderr` a result envelope carries, if it has one. */
function stderrOf(r: ToolResult): string | undefined {
  try {
    const v = JSON.parse(r.text) as { stderr?: unknown };
    return typeof v.stderr === "string" ? v.stderr : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `notifications/progress` for one call: one per step line, plus a heartbeat
 * that repeats the last step with a higher `progress` while the call runs.
 */
class Progress {
  private n = 0;
  private last = "working";
  private done = false;
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly send: (message: object) => void,
    private readonly token: Id,
  ) {
    this.timer = setInterval(() => this.emit(), HEARTBEAT_MS);
  }

  step(message: string): void {
    this.last = message;
    this.emit();
  }

  private emit(): void {
    if (this.done) return;
    this.n += 1;
    this.send({
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: { progressToken: this.token, progress: this.n, message: this.last },
    });
  }

  stop(): void {
    this.done = true;
    clearInterval(this.timer);
  }
}
