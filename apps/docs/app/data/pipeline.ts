/**
 * What the pipeline diagram (`app/components/content/PipelineDiagram.vue`)
 * says, kept here so `test/pipeline.test.ts` can check it against the CLI. A
 * ref has to parse as the kind it stands for and give the slug the diagram
 * shows, and every verb has to be one the CLI has, since a reader may copy
 * either one.
 */
import type { RefKind } from "./samples";

/** The two views: the Introduction's short one and How it works' detailed one. */
export const PIPELINE_VARIANTS = ["compact", "detail"] as const;
export type PipelineVariant = (typeof PIPELINE_VARIANTS)[number];

export interface PipelineRef {
	/** The kind of ref, as the reader knows it. */
	label: string;
	/** What `parseRef` makes of `ref`. */
	kind: Exclude<RefKind, "last">;
	/** A ref of that kind, as the reader would type it. */
	ref: string;
	/** How the diagram shows `ref`: the ref itself, or its start and "…". */
	shownRef?: string;
	/** The start of the slug the ref gets, with "…" when it goes on. */
	slug: string;
}

export interface PipelineSubstep {
	name: string;
	/** When the sub-step doesn't run every time, the reason. */
	when?: string;
}

export interface PipelineStep {
	name: string;
	/** The step as the old one-line code block wrote it. */
	call: string;
	caption: string;
}

export const PIPELINE_STEPS: Record<"resolve" | "materialize" | "act", PipelineStep> = {
	resolve: {
		name: "Resolve",
		call: "resolve(ref)",
		caption: "Turns the ref you typed into a git target and a slug.",
	},
	materialize: {
		name: "Materialize",
		call: "materialize(workspace)",
		caption: "Makes a worktree with its dependencies, seed files and ports, or reuses it.",
	},
	act: {
		name: "Act",
		call: "act(command)",
		caption: "Opens an editor, runs a command or starts a shell.",
	},
};

/** Resolve, in detail: each kind of ref and the slug it gets. */
export const PIPELINE_REFS: PipelineRef[] = [
	{ label: "Pull request", kind: "pr", ref: "42", slug: "pr-42" },
	{ label: "Branch", kind: "branch", ref: "feat/login", slug: "feat-login" },
	{
		label: "Commit",
		kind: "commit",
		ref: "9fceb02d0ae598e95dc970b74767f19372d61af8",
		shownRef: "9fceb02…",
		slug: "sha-9fceb02d0a",
	},
	{ label: "Path", kind: "path", ref: "../my-app", slug: "adopted-my-app-…" },
];

/** Materialize, in detail, in the order the CLI runs them (DESIGN §8.1). */
export const PIPELINE_SUBSTEPS: PipelineSubstep[] = [
	{ name: "Bare clone", when: "First use only" },
	{ name: "Worktree" },
	{ name: "Ports" },
	{ name: "Seed files" },
	{ name: "Setup", when: "Skipped on a cache hit" },
];

/** Act, in detail: the verbs that open a workspace and then do something in it. */
export const PIPELINE_VERBS = ["checkout", "code", "run", "exec", "shell", "start"] as const;
