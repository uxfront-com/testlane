// TESTLANE_* export vars + env composition (§5.5, §11.2).

import { legacyEnvAliases } from "../lib/compat.ts";
import { interpolate, workspaceVars, type TemplateVars } from "../lib/template.ts";
import type { ProjectConfig } from "../config/schema.ts";
import type { Workspace } from "./state.ts";

export interface WorkspaceContext {
  path: string;
  repoPath: string;
  dataDir: string;
  project: string;
  ref: string;
  branch: string;
  slug: string;
  ports: number[];
}

export function wsContext(project: ProjectConfig, ws: Workspace, dataDir: string): WorkspaceContext {
  return {
    path: ws.path,
    repoPath: project.repoPath,
    dataDir,
    project: project.name,
    ref: ws.ref,
    branch: ws.branch ?? (ws.number !== undefined ? `pr/${ws.number}` : ws.slug),
    slug: ws.slug,
    ports: ws.ports,
  };
}

/** Template variables for {path}/{port}/… interpolation (§5.5). */
export function templateVars(wc: WorkspaceContext): TemplateVars {
  return workspaceVars(wc);
}

/** The always-exported TESTLANE_* variables (§5.5). */
export function testlaneEnv(wc: WorkspaceContext): Record<string, string> {
  const e: Record<string, string> = {
    TESTLANE_PATH: wc.path,
    TESTLANE_REPO_PATH: wc.repoPath,
    TESTLANE_DATA_DIR: wc.dataDir,
    TESTLANE_PROJECT: wc.project,
    TESTLANE_REF: wc.ref,
    TESTLANE_BRANCH: wc.branch,
    TESTLANE_SLUG: wc.slug,
    TESTLANE_PORT: wc.ports[0] !== undefined ? String(wc.ports[0]) : "",
  };
  for (let i = 1; i < wc.ports.length; i++) {
    e[`TESTLANE_PORT_${i}`] = String(wc.ports[i]);
  }
  return e;
}

/**
 * Every exported variable: the TESTLANE_* set, then its 1.x twins for
 * scripts written before the rename (§5.6, `compat.ts`). Later layers override both.
 */
export function exportedEnv(wc: WorkspaceContext): Record<string, string> {
  const current = testlaneEnv(wc);
  return { ...current, ...legacyEnvAliases(current) };
}

/**
 * Compose the environment for run/exec/shell/hooks (later wins, §11.2):
 * process.env → TESTLANE_* (and 1.x twins) → project [env] → command env → --env flags.
 */
export function composeEnv(
  wc: WorkspaceContext,
  project: ProjectConfig,
  extra?: { commandEnv?: Record<string, string>; flagEnv?: Record<string, string> },
): Record<string, string> {
  const vars = templateVars(wc);
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  Object.assign(out, exportedEnv(wc));
  for (const [k, v] of Object.entries(project.env)) {
    out[k] = interpolate(v, vars, `env.${k}`);
  }
  if (extra?.commandEnv) {
    for (const [k, v] of Object.entries(extra.commandEnv)) {
      out[k] = interpolate(v, vars, `command.env.${k}`);
    }
  }
  if (extra?.flagEnv) Object.assign(out, extra.flagEnv);
  return out;
}
