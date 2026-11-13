// A minimal MCP client for the integration tests: it spawns the built
// `testlane mcp` and speaks newline-delimited JSON-RPC 2.0 to it, keeping every
// stdout line, so a test can check that nothing else ever reached stdout.

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
export const builtCli = join(repoRoot, "dist", "bin", "testlane.js");

export interface Message {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export interface Received {
  msg: Message;
  /** `Date.now()` when the line arrived. */
  at: number;
}

export interface ToolAnswer {
  /** The text block, parsed as JSON. */
  value: any;
  isError: boolean;
  at: number;
}

export class McpClient {
  /** Every line the server wrote to stdout, as written. */
  readonly stdoutLines: string[] = [];
  readonly received: Received[] = [];
  stderr = "";
  readonly exited: Promise<number | null>;
  private readonly child: ChildProcess;
  private buffer = "";
  private nextId = 1;
  private readonly waiting = new Map<string, (r: Received) => void>();

  constructor(env: Record<string, string>, preArgs: string[] = []) {
    this.child = spawn(process.execPath, [builtCli, ...preArgs, "mcp"], {
      env: { ...(process.env as Record<string, string>), NO_COLOR: "1", TESTLANE_DEBUG: "0", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.exited = new Promise((resolve) => this.child.once("exit", (code) => resolve(code)));
    this.child.stdout!.setEncoding("utf8");
    this.child.stderr!.setEncoding("utf8");
    this.child.stderr!.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    this.child.stdout!.on("data", (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        this.onLine(line);
      }
    });
  }

  get pid(): number {
    return this.child.pid!;
  }

  private onLine(line: string): void {
    this.stdoutLines.push(line);
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      return; // the stdout check reports it
    }
    const r = { msg, at: Date.now() };
    this.received.push(r);
    if (msg.method === undefined && msg.id !== undefined) {
      const k = JSON.stringify(msg.id);
      this.waiting.get(k)?.(r);
      this.waiting.delete(k);
    }
  }

  /** Write one raw line to the server's stdin. */
  sendLine(line: string): void {
    this.child.stdin!.write(line + "\n");
  }

  /** Send a request and wait for its response. */
  request(method: string, params?: Record<string, unknown>, id: string | number = this.nextId++): Promise<Received> {
    const answer = this.expect(id);
    this.sendLine(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }));
    return answer;
  }

  /** Wait for the response to `id`, sent some other way. */
  expect(id: string | number | null): Promise<Received> {
    return new Promise((resolve) => this.waiting.set(JSON.stringify(id), resolve));
  }

  notify(method: string, params?: Record<string, unknown>): void {
    this.sendLine(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }));
  }

  async initialize(protocolVersion = "2025-11-25"): Promise<Received> {
    const r = await this.request("initialize", {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "testlane-tests", version: "0" },
    });
    this.notify("notifications/initialized");
    return r;
  }

  /** Call a tool and parse its text block. */
  async call(
    name: string,
    args: Record<string, unknown> = {},
    opts: { id?: string | number; progressToken?: string | number } = {},
  ): Promise<ToolAnswer> {
    const params: Record<string, unknown> = { name, arguments: args };
    if (opts.progressToken !== undefined) params._meta = { progressToken: opts.progressToken };
    const r = await this.request("tools/call", params, opts.id ?? this.nextId++);
    if (r.msg.error) throw new Error(`${name}: JSON-RPC error ${r.msg.error.code} ${r.msg.error.message}`);
    const result = r.msg.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    const text = result.content[0]!.text;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`${name}: text block is not JSON: ${text}`);
    }
    return { value, isError: result.isError, at: r.at };
  }

  /** The progress notifications that carried `token`. */
  progress(token: string | number): Received[] {
    return this.received.filter(
      (r) => r.msg.method === "notifications/progress" && r.msg.params?.progressToken === token,
    );
  }

  /** End stdin and wait for the server to exit. Kills it after `ms`. */
  async close(ms = 8_000): Promise<number | null> {
    this.child.stdin!.end();
    const timer = setTimeout(() => this.child.kill("SIGKILL"), ms);
    const code = await this.exited;
    clearTimeout(timer);
    return code;
  }

  kill(): void {
    this.child.kill("SIGKILL");
  }
}
