// Compatibility with uxd, the name Testlane had before 2.0 (DESIGN.md §5.6).
//
// Testlane 2.x still reads uxd's config dir, state dir, $UXD_CONFIG_DIR and
// $UXD_DEBUG, and exports every TESTLANE_* variable under its UXD_* name too.
// Each fallback prints one warning on stderr with the fix, at most once per run,
// and never writes to stdout, so `--json` output stays parseable. Every mention
// of the old name in the CLI lives in this file, so 3.0 deletes it.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

const LEGACY_NAME = "uxd";
const LEGACY_PREFIX = "UXD_";
const CURRENT_PREFIX = "TESTLANE_";

const warned = new Set<string>();

/** Forget the warnings printed so far. `main()` calls it at the start of each run. */
export function resetCompatWarnings(): void {
  warned.clear();
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  process.stderr.write(`warning: ${message}\n`);
}

/** Show a path under the home directory as `~/…`, the way the docs write it. */
function display(p: string): string {
  const home = homedir();
  if (p === home) return "~";
  if (p.startsWith(home + sep)) return `~${p.slice(home.length)}`;
  return p;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/** uxd's config dir, `~/.uxd`. */
export function legacyConfigDir(): string {
  return join(homedir(), `.${LEGACY_NAME}`);
}

/** uxd's state dir under the given XDG state home. */
export function legacyStateDir(stateHome: string): string {
  return join(stateHome, LEGACY_NAME);
}

/**
 * The directory to use: `current` if it exists, else uxd's `legacy` if that
 * exists (with a warning), else `current`, which the caller may create.
 */
export function preferCurrentDir(current: string, legacy: string, what: string): string {
  if (existsSync(current)) return current;
  if (!existsSync(legacy)) return current;
  const from = display(legacy);
  const to = display(current);
  warnOnce(
    `dir:${legacy}`,
    `using ${from}, the ${what} of uxd. Testlane 3.0 reads only ${to}. Move it: mv ${from} ${to}`,
  );
  return legacy;
}

/** `$UXD_CONFIG_DIR` when it's set, with a warning. The caller checks `$TESTLANE_CONFIG_DIR` first. */
export function legacyConfigDirFromEnv(): string | undefined {
  const value = nonEmpty(process.env[`${LEGACY_PREFIX}CONFIG_DIR`]);
  if (value === undefined) return undefined;
  warnOnce(
    "env:CONFIG_DIR",
    `using ${LEGACY_PREFIX}CONFIG_DIR, the variable of uxd. Testlane 3.0 reads only ${CURRENT_PREFIX}CONFIG_DIR. Rename it to ${CURRENT_PREFIX}CONFIG_DIR`,
  );
  return value;
}

/** True when `$UXD_DEBUG=1`, with a warning. The caller checks `$TESTLANE_DEBUG` first. */
export function legacyDebugFromEnv(): boolean {
  if (process.env[`${LEGACY_PREFIX}DEBUG`] !== "1") return false;
  warnOnce(
    "env:DEBUG",
    `using ${LEGACY_PREFIX}DEBUG, the variable of uxd. Testlane 3.0 reads only ${CURRENT_PREFIX}DEBUG. Set ${CURRENT_PREFIX}DEBUG=1 instead`,
  );
  return true;
}

/** The `UXD_*` twin of every `TESTLANE_*` variable, for dev servers and hooks written for uxd. */
export function legacyEnvAliases(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(CURRENT_PREFIX)) out[LEGACY_PREFIX + key.slice(CURRENT_PREFIX.length)] = value;
  }
  return out;
}
