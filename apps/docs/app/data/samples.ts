/**
 * The refs and code samples the homepage shows, kept here so
 * `test/samples.test.ts` can check them. Each ref goes through the CLI's own
 * parser (`parseRef` in src/core/resolve.ts), since a sample that reads as a
 * commit but parses as a branch would send a reader who copies it to the wrong
 * place. And each line has to fit a phone, where the code panel can't scroll
 * with the keyboard in every browser.
 */
export type RefKind = "pr" | "branch" | "commit" | "path" | "last";

export interface RefSample {
	/** What the reader passes to `testlane`. */
	ref: string;
	/** How the sample shows it: the ref itself, or its start and "…". */
	shown?: string;
	/** What `parseRef` makes of it. */
	kind: RefKind;
	/** Anything after the ref, like a verb. */
	rest?: string;
	/** The comment above the command. */
	comment: string;
}

/** The Refs chapter's code sample, one comment and command per ref. */
export const REF_SAMPLES: RefSample[] = [
	{ ref: "42", kind: "pr", comment: "A pull request" },
	{ ref: "feat/login", kind: "branch", comment: "A branch" },
	{
		ref: "9fceb02d0ae598e95dc970b74767f19372d61af8",
		shown: "9fceb02…",
		kind: "commit",
		comment: "A commit, all 40 characters",
	},
	{ ref: "-", kind: "last", rest: "shell", comment: "The ref you used last" },
];

/** The four workspaces the hero and the Isolation chapter label, top to bottom. */
export const WORKSPACES: { ref: string; kind: RefKind; port: string }[] = [
	{ ref: "#42", kind: "pr", port: "3053" },
	{ ref: "feat/login", kind: "branch", port: "3011" },
	{ ref: "fix/ports", kind: "branch", port: "3027" },
	{ ref: "main", kind: "branch", port: "3040" },
];

/** `REF_SAMPLES` as the sample shows them, plus a link, which names the project too. */
export const refsCode = [
	...REF_SAMPLES.map(
		({ ref, shown, rest, comment }) =>
			`# ${comment}\ntestlane app ${[shown ?? ref, rest].filter(Boolean).join(" ")}`,
	),
	"# Straight from a link\ntestlane …/pull/42 code",
].join("\n");

/** The Environment chapter's project file. */
export const configCode = `ports = 2

[setup]
run = "pnpm install"
cache_key = ["pnpm-lock.yaml"]
seed_files = [".env.local"]

[env]
PORT = "{port}"
API_PORT = "{port+1}"`;
