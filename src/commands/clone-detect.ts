// The steps `config add <url>` and `setup --detect` share (§9.12): clone the
// primary repo (or fetch it when it's already there), run the trust gate on its
// `.testlane.toml`, and, when there is no such file and the caller asked, draft
// a config from the files at `origin/<default>`.

import { rmSync } from "node:fs";
import { TestlaneError, configError } from "../lib/errors.ts";
import type { Ctx, ProjectConfig } from "../config/schema.ts";
import { detect } from "../config/detect.ts";
import { renderDraft } from "../config/detect-emit.ts";
import { acquireLock, loadState, saveState } from "../core/state.ts";
import { gitFiles } from "../core/repo-files.ts";
import { repoConfigBranch, trustGate } from '../core/trust.ts';
import type { TrustResult } from '../core/trust.ts';
import { detectDefaultBranch, fetchBranch, initPrimaryRepo, isInitialized, originUrl } from '../git/repo.ts';
import type { GitEnv } from '../git/repo.ts';

export interface CloneDetectOptions {
  /** The clone URL, as the project file writes it. */
  repo: string;
  /** Drop a stored approval first: a new project must not inherit an old one's. */
  clearApproval: boolean;
  /** Puts back what the caller wrote, when the clone fails or an existing clone is of another repo. */
  rollback(): void;
  /** Hint for the off-a-terminal "not trusted" error. */
  untrustedHint: string;
  /** Draft a config when the repo has no `.testlane.toml`. */
  detect?: { repoReason: string; defaultBranch?: string };
}

export interface CloneDetectResult {
  trust: TrustResult;
  /** The draft, when `detect` was asked and the repo had no `.testlane.toml`. */
  draft?: string;
}

export async function cloneTrustDetect(
  ctx: Ctx,
  project: ProjectConfig,
  opts: CloneDetectOptions,
): Promise<CloneDetectResult> {
  const name = project.name;
  const lock = await acquireLock(name, ctx.log);
  try {
    const g: GitEnv = { repoPath: project.repoPath, dryRun: false, log: ctx.log };
    if (!isInitialized(project.repoPath)) {
      try {
        await initPrimaryRepo(g, opts.repo);
      } catch (error) {
        // repo_path didn't exist before this run.
        rmSync(project.repoPath, { recursive: true, force: true });
        opts.rollback();
        if (error instanceof TestlaneError && error.errCode === "E_GIT") {throw error;}
        throw new TestlaneError("E_GIT", `cloning ${opts.repo} failed: ${(error as Error).message}`);
      }
    } else {
      // An existing clone (a `setup --force` re-run). It must be a clone of this
      // repo: detecting from, or trusting, another repo's files under this
      // `repo` line would be wrong.
      const cloned = await originUrl(project.repoPath);
      if (cloned !== opts.repo) {
        opts.rollback();
        throw configError(
          `${project.repoPath} is a clone of ${cloned ?? "an unknown repo"}, not ${opts.repo}`,
          `remove ${project.repoPath} and run the command again, or set repo_path in ${name}.toml`,
        );
      }
      // Bring its default branch up to date.
      const branch = await repoConfigBranch(project, () => detectDefaultBranch(g));
      if (branch) {await fetchBranch(g, branch);}
    }

    const state = loadState(name);
    // A state file left by an earlier project of this name must not lend its
    // approval to this repo. Saved before the gate, which throws off a terminal
    // without --yes.
    if (opts.clearApproval && state.repoConfig !== undefined) {
      delete state.repoConfig;
      saveState(name, state);
    }
    const trust = await trustGate(ctx, project, state, { explicit: true, untrustedHint: opts.untrustedHint });
    if (trust.stateChanged) {saveState(name, state);}

    if (!opts.detect || trust.outcome !== "no-file" || !trust.branch) {return { trust };}
    ctx.log.step(`detecting a config from origin/${trust.branch}`);
    const findings = await detect(gitFiles(project.repoPath, `refs/remotes/origin/${trust.branch}`), {
      repo: { value: opts.repo, reason: opts.detect.repoReason },
      project: name,
    });
    const draft = renderDraft(findings, {
      source: `origin/${trust.branch}`,
      ...(opts.detect.defaultBranch !== undefined ? { defaultBranch: opts.detect.defaultBranch } : {}),
    });
    return { trust, draft: draft.text };
  } finally {
    lock.release();
  }
}
