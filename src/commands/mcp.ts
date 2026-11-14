// `mcp` — serve Testlane's tools to an MCP client over stdio (§9.18, ADR-003).

import { ExitCode, usage } from "../lib/errors.ts";
import { parseFlags } from "../cli/flags.ts";
import { version } from "../cli/help.ts";
import { McpServer } from "../mcp/server.ts";
import type { TopInput } from "./types.ts";

export async function mcp(input: TopInput): Promise<number> {
  const flags = parseFlags(input.args, {});
  if (flags.positionals.length > 0) {
    throw usage(`mcp takes no arguments, got '${flags.positionals[0]}'`, "run `testlane mcp` from your MCP client's config");
  }

  // stdout carries only protocol messages. The server keeps the one real
  // writer, and anything else written to stdout goes to stderr instead.
  const stdout = process.stdout;
  const original = stdout.write;
  const writeProtocol = original.bind(stdout) as (line: string) => boolean;
  stdout.write = ((...args: Parameters<typeof stdout.write>) =>
    (process.stderr.write as (...a: unknown[]) => boolean)(...args)) as typeof stdout.write;

  const server = new McpServer({
    configDir: input.ctx.configDir,
    version: version(),
    input: process.stdin,
    send: (line) => {
      writeProtocol(line);
    },
  });
  // A client that goes away, or a signal, ends the session like the end of stdin.
  const end = () => server.stop();
  stdout.on("error", end);
  process.on("SIGTERM", end);
  process.on("SIGINT", end);
  try {
    await server.serve();
  } finally {
    process.off("SIGTERM", end);
    process.off("SIGINT", end);
    stdout.write = original;
  }
  // Let the last answers reach the pipe before the process exits.
  if (stdout.writableLength > 0) {
    await new Promise<void>((resolve) => {
      stdout.once("drain", () => resolve());
      stdout.once("error", () => resolve());
    });
  }
  stdout.off("error", end);
  return ExitCode.SUCCESS;
}
