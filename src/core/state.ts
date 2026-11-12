// State file (load/save, atomic) + per-project locking (§7.6, §8.2).

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { TestlaneError, gitError } from "../lib/errors.ts";
import { stateDir } from "../lib/paths.ts";
import type { Logger } from "../lib/log.ts";

export const STATE_VERSION = 1;

export interface Workspace {
  slug: string;
  ref: string; // as originally typed
  kind: "pr" | "branch" | "commit" | "path";
  number?: number;
  branch?: string;
  path: string;
  adopted: boolean;
  ports: number[];
  createdAt: string;
  lastUsedAt: string;
  setupHash?: string;
  pr?: {
    title: string;
    author: string;
    state: string;
    url: string;
    headRefName: string;
    fetchedAt: string;
  };
}

export interface State {
  version: number;
  defaultBranch?: string;
  lastRef?: string;
  workspaces: Record<string, Workspace>;
}

function statePath(project: string): string {
  return join(stateDir(), `${project}.json`);
}

function lockPath(project: string): string {
  return join(stateDir(), `${project}.lock`);
}

function ensureStateDir(): void {
  mkdirSync(stateDir(), { recursive: true });
}

/** Load a project's state; returns an empty v1 state if the file is absent. */
export function loadState(project: string): State {
  const file = statePath(project);
  if (!existsSync(file)) {
    return { version: STATE_VERSION, workspaces: {} };
  }
  let parsed: State;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as State;
  } catch (e) {
    throw new TestlaneError("E_CONFIG", `state file ${file} is corrupt: ${(e as Error).message}`, {
      hint: "remove or repair the file",
    });
  }
  if (parsed.version !== STATE_VERSION) {
    throw new TestlaneError("E_CONFIG", `state file ${file} has unknown version ${parsed.version}`, {
      hint: `this Testlane understands version ${STATE_VERSION}; upgrade Testlane or migrate the file`,
    });
  }
  if (!parsed.workspaces) parsed.workspaces = {};
  return parsed;
}

/** Atomically persist state (temp file + rename, §8.2, §19.9). */
export function saveState(project: string, state: State): void {
  ensureStateDir();
  const file = statePath(project);
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

// ── Locking (§7.6) ──────────────────────────────────────────────────────────

export interface Lock {
  release(): void;
}

export interface LockContents {
  pid: number;
  startedAt: string;
}

const LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_MS = 250;

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH → dead; EPERM → alive but not ours.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Acquire an exclusive per-project lock. Steals a stale lock (dead holder) with
 * a warning; waits up to 30s on a live holder, then exits 5 (§7.6).
 */
export async function acquireLock(project: string, log: Logger): Promise<Lock> {
  ensureStateDir();
  return acquireFileLock(lockPath(project), {
    label: `'${project}'`,
    timeoutMs: LOCK_TIMEOUT_MS,
    log,
    onTimeout: (holder) =>
      gitError(
        `timed out waiting for lock on '${project}'`,
        holder ? `held by pid ${holder.pid} since ${holder.startedAt}` : undefined,
      ),
  });
}

export interface FileLockOptions {
  /** Names the lock in the stale-lock warning, e.g. `'n8n'`. */
  label: string;
  timeoutMs: number;
  log: Logger;
  /** The error thrown when a live holder outlasts `timeoutMs`. */
  onTimeout(holder: LockContents | null): TestlaneError;
}

/**
 * Create `file` exclusively (`wx`) and hold it until `release()`. A lock whose
 * holder PID is dead is stolen with a warning; a live holder is waited on for
 * `timeoutMs` (§7.6). The file's directory must exist.
 */
export async function acquireFileLock(file: string, opts: FileLockOptions): Promise<Lock> {
  const deadline = Date.now() + opts.timeoutMs;

  for (;;) {
    try {
      const fd = openSync(file, "wx"); // O_CREAT | O_EXCL | O_WRONLY
      const contents: LockContents = { pid: process.pid, startedAt: new Date().toISOString() };
      writeSync(fd, JSON.stringify(contents));
      closeSync(fd);
      return { release: () => rmSync(file, { force: true }) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;

      const holder = readLock(file);
      if (holder && !pidAlive(holder.pid)) {
        opts.log.warn(`stealing stale lock for ${opts.label} (dead pid ${holder.pid})`);
        rmSync(file, { force: true });
        continue;
      }
      if (Date.now() >= deadline) throw opts.onTimeout(holder);
      await sleep(LOCK_POLL_MS);
    }
  }
}

function readLock(file: string): LockContents | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LockContents;
  } catch {
    return null;
  }
}

export { statePath, lockPath };
