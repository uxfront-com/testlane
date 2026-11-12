// Path helpers: ~ expansion (leading only, no env interpolation) and XDG dirs.

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { legacyConfigDir, legacyStateDir, preferCurrentDir } from "./compat.ts";

/** Expand a leading `~` / `~/` to the user's home. No env-var interpolation (§5.4). */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** Expand `~` then make absolute against `base` (default: cwd). */
export function resolvePath(p: string, base = process.cwd()): string {
  const expanded = expandTilde(p);
  return isAbsolute(expanded) ? expanded : resolve(base, expanded);
}

/**
 * Default config directory (§5.1): `~/.testlane`, or the 1.x config dir when only
 * that one exists (§5.6, `compat.ts`). Override via --config-dir / $TESTLANE_CONFIG_DIR.
 */
export function defaultConfigDir(): string {
  return preferCurrentDir(join(homedir(), ".testlane"), legacyConfigDir(), "config dir");
}

/**
 * `${XDG_STATE_HOME:-~/.local/state}/testlane` (§7.6, §8.2), or the 1.x state dir
 * when only that one exists (§5.6, `compat.ts`).
 */
export function stateDir(): string {
  const home = xdgStateHome();
  return preferCurrentDir(join(home, "testlane"), legacyStateDir(home), "state dir");
}

export function xdgStateHome(): string {
  const fromEnv = process.env.XDG_STATE_HOME;
  if (fromEnv && fromEnv.trim() !== "") return expandTilde(fromEnv);
  return join(homedir(), ".local", "state");
}
