// Detached process supervision for `start` / `stop` / `logs` / `ps` (§9.14–9.17).
// One process per workspace, recorded in `<data_dir>/process.json`.

import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { TestlaneError } from "../lib/errors.ts";
import { capture } from "../lib/proc.ts";
import { pidAlive } from "./state.ts";

export interface ProcessEntry {
  pid: number;
  /** The process's start time as `ps -o lstart=` prints it; tells a reused PID apart. */
  lstart: string;
  /** The `commands.<name>` key that was started. */
  command: string;
  port: number;
  log: string;
  startedAt: string;
}

export const processFile = (dataDir: string) => join(dataDir, "process.json");
export const logFile = (dataDir: string) => join(dataDir, "process.log");
export const startLockFile = (dataDir: string) => join(dataDir, "start.lock");

/** SIGTERM → SIGKILL grace period for `stop` (§9.15). */
export const STOP_GRACE_MS = 10_000;
const POLL_MS = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The recorded entry, or null when there is none or it can't be read. */
export function readEntry(dataDir: string): ProcessEntry | null {
  const file = processFile(dataDir);
  if (!existsSync(file)) return null;
  try {
    const e = JSON.parse(readFileSync(file, "utf8")) as Partial<ProcessEntry>;
    // PID 1 is init, and kill(-1) would signal every process we may signal.
    if (typeof e.pid !== "number" || !Number.isInteger(e.pid) || e.pid <= 1) return null;
    if (typeof e.lstart !== "string" || typeof e.command !== "string") return null;
    return e as ProcessEntry;
  } catch {
    return null;
  }
}

/** Atomically write the entry (temp file + rename, as state does). */
export function writeEntry(dataDir: string, entry: ProcessEntry): void {
  const file = processFile(dataDir);
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(entry, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** Remove the entry; with `pid`, only when the recorded entry still names it. */
export function removeEntry(dataDir: string, pid?: number): void {
  if (pid !== undefined) {
    const current = readEntry(dataDir);
    if (current && current.pid !== pid) return;
  }
  rmSync(processFile(dataDir), { force: true });
}

/** `ps -o lstart= -p <pid>`, or null when ps can't see the PID. */
export async function startTime(pid: number): Promise<string | null> {
  const res = await capture(["ps", "-o", "lstart=", "-p", String(pid)], {
    allowFailure: true,
    // lstart is locale-formatted; pin it so start and stop compare like with like.
    env: { ...(process.env as Record<string, string>), LC_ALL: "C" },
  });
  const out = res.stdout.trim();
  return res.code === 0 && out !== "" ? out : null;
}

/**
 * The one liveness test `start`, `stop` and `ps` share: the PID answers
 * `kill(pid, 0)` and its start time equals the recorded one. Anything else,
 * a dead PID or one the OS has since given to another process, is exited.
 */
export async function isLive(entry: ProcessEntry): Promise<boolean> {
  if (!pidAlive(entry.pid)) return false;
  const lstart = await startTime(entry.pid);
  return lstart !== null && lstart === entry.lstart;
}

/** True while any process is left in the group `pgid`. */
export function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return; // already gone
    if (code === "EPERM") {
      throw new TestlaneError("E_SETUP", `not permitted to signal process group ${pgid}`, {
        hint: "it belongs to another user; stop it as that user",
      });
    }
    throw e;
  }
}

/** Wait until the group is empty or `ms` passes. Returns true when it emptied. */
async function waitGroupGone(pgid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (groupAlive(pgid)) {
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}

/**
 * SIGTERM the process group, wait up to `graceMs` for it to empty, then SIGKILL
 * it (§9.15). The group is the whole tree a `bash -c` started, so a dev server
 * under the shell dies with it.
 */
export async function stopGroup(pgid: number, graceMs = STOP_GRACE_MS): Promise<"terminated" | "killed"> {
  signalGroup(pgid, "SIGTERM");
  if (await waitGroupGone(pgid, graceMs)) return "terminated";
  signalGroup(pgid, "SIGKILL");
  await waitGroupGone(pgid, 2_000);
  return "killed";
}

export type StopOutcome =
  | { kind: "none" }
  | { kind: "exited"; entry: ProcessEntry }
  | { kind: "stopped"; entry: ProcessEntry; how: "terminated" | "killed" };

/**
 * Stop the workspace's recorded process, if live, and clear its entry. A dead
 * or reused PID is never signalled. The log is kept.
 */
export async function stopRecorded(dataDir: string, graceMs = STOP_GRACE_MS): Promise<StopOutcome> {
  const entry = readEntry(dataDir);
  if (!entry) {
    // An unreadable file is no entry: clear it so `start` can record afresh.
    rmSync(processFile(dataDir), { force: true });
    return { kind: "none" };
  }
  if (!(await isLive(entry))) {
    removeEntry(dataDir, entry.pid);
    return { kind: "exited", entry };
  }
  const how = await stopGroup(entry.pid, graceMs);
  removeEntry(dataDir, entry.pid);
  return { kind: "stopped", entry, how };
}

/** True when something accepts a TCP connection on 127.0.0.1:`port` within 1s. */
export function portAccepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1_000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * Poll 127.0.0.1:`port` until it accepts, the child exits (`hasExited`), or
 * `deadline` (epoch ms) passes.
 */
export async function waitForPort(
  port: number,
  deadline: number,
  hasExited: () => boolean,
): Promise<"ready" | "exited" | "timeout"> {
  for (;;) {
    if (hasExited()) return "exited";
    if (await portAccepts(port)) return hasExited() ? "exited" : "ready";
    if (Date.now() >= deadline) return "timeout";
    await sleep(200);
  }
}

/** The last `n` lines of `file` (reads at most its last 64 KiB). */
export function tailLines(file: string, n: number): string[] {
  if (!existsSync(file)) return [];
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, 64 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString("utf8").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines.slice(-n);
  } finally {
    closeSync(fd);
  }
}
