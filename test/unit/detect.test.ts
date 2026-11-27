// `config detect` rules (§9.12, §17.1): pure functions over the in-memory
// adapter, so no git and no filesystem.

import { parse as parseToml } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";

import {
	renderDraft,
	setDraftTransform,
	tomlText,
	validateDraft,
} from "../../src/config/detect-emit.ts";
import { globMatch, matchWorkspaces, parseWorkspaceYaml } from "../../src/config/detect-parse.ts";
import { detect, isPathArgument, memoryFiles, normaliseRepoUrl } from "../../src/config/detect.ts";
import type { Finding } from "../../src/config/detect.ts";
import { RawProjectSchema, RawRepoSchema } from "../../src/config/schema.ts";
import {
	FIXTURES,
	F1_PNPM_TURBO,
	F2_SINGLE_NUXT,
	F3_NPM_ROOT_PNPM_DOCS,
	F4_MANY_APPS,
	F5_VITE_PLUS,
} from "./detect-fixtures.ts";

const REPO = { value: "git@github.com:acme/app.git", reason: "app.toml" };
const json = (v: unknown): string => JSON.stringify(v);

async function findings(
	files: Record<string, string>,
	opts: Parameters<typeof detect>[1] = { repo: REPO },
): Promise<Array<Finding>> {
	return detect(memoryFiles(files), opts);
}

async function draft(files: Record<string, string>, repoFile = false) {
	return renderDraft(await findings(files), { source: "test", repoFile });
}

async function config(files: Record<string, string>): Promise<Record<string, any>> {
	return parseToml((await draft(files)).text) as Record<string, any>;
}

const notes = (fs: Array<Finding>): Array<string> =>
	fs.flatMap((f) => (f.kind === "note" ? [f.reason] : []));
const find = (fs: Array<Finding>, key: string): Finding | undefined =>
	fs.find((f) => f.key === key);

/** A root package.json plus extra files. */
function repo(
	pkg: Record<string, unknown>,
	files: Record<string, string> = {},
): Record<string, string> {
	return { "package.json": json(pkg), ...files };
}

afterEach(() => setDraftTransform(null));

// ── The five fixtures ────────────────────────────────────────────────────────

describe("fixture drafts", () => {
	it("F1 pnpm + turbo, Nuxt in apps/web", async () => {
		expect(await config(F1_PNPM_TURBO)).toEqual({
			repo: REPO.value,
			setup: {
				run: "pnpm install --frozen-lockfile && pnpm turbo run build --filter=web^...",
				cache_key: ["pnpm-lock.yaml", "pnpm-workspace.yaml", "**/package.json"],
				seed_files: ["apps/web/.env"],
			},
			env: { NUXT_TELEMETRY_DISABLED: "1" },
			commands: {
				dev: { run: "pnpm --filter web exec nuxt dev --host 127.0.0.1 --port {port}" },
				test: { run: "pnpm test" },
				check: { run: "pnpm lint && pnpm format:check && pnpm check-types" },
			},
		});
		const fs = await findings(F1_PNPM_TURBO);
		expect(notes(fs)).toContain("pnpm-workspace.yaml: skipped allowBuilds");
		expect(notes(fs)).toContain(
			'the install runs apps/web/package.json postinstall "nuxt prepare"',
		);
	});

	it("F2 single Nuxt app", async () => {
		expect(await config(F2_SINGLE_NUXT)).toEqual({
			repo: REPO.value,
			setup: {
				run: "pnpm install --frozen-lockfile",
				cache_key: ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"],
				seed_files: [".env"],
			},
			env: { NUXT_TELEMETRY_DISABLED: "1" },
			commands: {
				dev: { run: "pnpm exec nuxt dev --host 127.0.0.1 --port {port}" },
				test: { run: "pnpm test" },
				check: { run: "pnpm check-types" },
			},
		});
	});

	it("F3 npm root, pnpm docs app", async () => {
		expect(await config(F3_NPM_ROOT_PNPM_DOCS)).toEqual({
			repo: REPO.value,
			setup: {
				run: "pnpm install --frozen-lockfile",
				cache_key: ["pnpm-lock.yaml", "pnpm-workspace.yaml", "**/package.json"],
			},
			env: { NUXT_TELEMETRY_DISABLED: "1" },
			commands: {
				dev: { run: "pnpm --filter @uxfront/docs exec nuxt dev --host 127.0.0.1 --port {port}" },
				test: { run: "pnpm test" },
				check: { run: "pnpm typecheck" },
			},
		});
		const fs = await findings(F3_NPM_ROOT_PNPM_DOCS);
		expect(find(fs, "setup.run")!.kind).toBe("guess");
		expect(notes(fs)).toContain(
			"package-lock.json (npm) also present; this draft installs with pnpm",
		);
		expect(notes(fs)).toContain("pnpm-workspace.yaml: skipped allowBuilds, catalog, catalogs");
	});

	it("F4 Nuxt docs, Nuxt app, Vite playground, Storybook, conductor.toml", async () => {
		expect(await config(F4_MANY_APPS)).toEqual({
			repo: REPO.value,
			ports: 4,
			setup: {
				run: "pnpm install --frozen-lockfile && pnpm turbo run build --filter=@styleframe/docs^...",
				cache_key: ["pnpm-lock.yaml", "pnpm-workspace.yaml", "**/package.json"],
				seed_files: ["apps/app/.env", "apps/docs/.env"],
			},
			env: { NUXT_TELEMETRY_DISABLED: "1" },
			commands: {
				dev: { run: "pnpm --filter @styleframe/docs exec nuxt dev --host 127.0.0.1 --port {port}" },
				app: {
					run: "pnpm --filter @styleframe/app exec nuxt dev --host 127.0.0.1 --port {port+1}",
				},
				playground: {
					run: "pnpm --filter @styleframe/playground exec vite --host 127.0.0.1 --port {port+2} --strictPort",
				},
				storybook: {
					run: "pnpm --filter @styleframe/storybook exec storybook dev --host 127.0.0.1 -p {port+3} --ci",
				},
				test: { run: "pnpm test" },
				check: { run: "pnpm lint && pnpm format:check && pnpm typecheck" },
			},
		});
		const fs = await findings(F4_MANY_APPS);
		expect(notes(fs)).toContain('conductor.toml setup runs "pnpm install && pnpm build"');
		expect(notes(fs)).toContain('conductor.toml run runs "pnpm run dev:docs"');
	});

	it("F5 vite-plus: a note for vp, no build guess, and no # guess: anywhere", async () => {
		expect(await config(F5_VITE_PLUS)).toEqual({
			repo: REPO.value,
			setup: {
				run: "pnpm install --frozen-lockfile",
				cache_key: ["pnpm-lock.yaml", "pnpm-workspace.yaml", "**/package.json"],
			},
			env: { NUXT_TELEMETRY_DISABLED: "1" },
			commands: {
				dev: { run: "pnpm --filter website exec nuxt dev --host 127.0.0.1 --port {port}" },
				test: { run: "pnpm test" },
				check: { run: "pnpm check" },
			},
		});
		const d = await draft(F5_VITE_PLUS);
		expect(d.text).toContain(
			"# note: vite-plus (vp) runs this repo's tasks; the draft doesn't guess a build step before dev",
		);
		expect(d.text).not.toContain("# guess:");
	});

	it("every key line of every draft carries # detected: or # guess:, and every draft validates", async () => {
		for (const files of Object.values(FIXTURES)) {
			for (const repoFile of [false, true]) {
				const { text } = await draft(files, repoFile);
				for (const line of text.split("\n")) {
					if (line === "" || /^\[.+\]$/.test(line) || line.startsWith("# note: ")) {
						continue;
					}
					expect(line).toMatch(/ {2}# (detected|guess): \S/);
				}
				const parsed = parseToml(text);
				expect((repoFile ? RawRepoSchema : RawProjectSchema).safeParse(parsed).success).toBe(true);
			}
		}
	});

	it("--repo-file drops repo, and its draft passes RawRepoSchema", async () => {
		for (const files of Object.values(FIXTURES)) {
			const d = await draft(files, true);
			expect(d.config.repo).toBeUndefined();
			expect(d.findings.some((f) => f.key === "repo")).toBe(false);
			expect(RawRepoSchema.safeParse(d.config).success).toBe(true);
		}
	});
});

// ── 1. Package manager ───────────────────────────────────────────────────────

describe("rule 1: package manager", () => {
	it.each([
		["pnpm@9.0.0", "pnpm install --frozen-lockfile"],
		["npm@10.0.0", "npm ci"],
		["yarn@1.22.0", "yarn install --frozen-lockfile"],
		["yarn@4.5.0", "yarn install --immutable"],
		["bun@1.2.0", "bun install --frozen-lockfile"],
	])("packageManager %s → %s", async (pm, install) => {
		const lock = {
			pnpm: "pnpm-lock.yaml",
			npm: "package-lock.json",
			yarn: "yarn.lock",
			bun: "bun.lock",
		}[pm.split("@")[0]!]!;
		const fs = await findings(repo({ packageManager: pm }, { [lock]: "" }));
		expect(find(fs, "setup.run")).toMatchObject({
			value: install,
			confidence: "high",
			kind: "detected",
		});
	});

	it.each([
		["pnpm-lock.yaml", "pnpm install --frozen-lockfile"],
		["package-lock.json", "npm ci"],
		["yarn.lock", "yarn install --frozen-lockfile"],
		["bun.lock", "bun install --frozen-lockfile"],
		["bun.lockb", "bun install --frozen-lockfile"],
	])("the only lockfile %s → %s", async (lock, install) => {
		const fs = await findings(repo({}, { [lock]: "" }));
		expect(find(fs, "setup.run")).toMatchObject({ value: install, confidence: "high" });
		expect(find(fs, "setup.cache_key")!.value).toEqual([lock, "package.json"]);
	});

	it("Yarn berry by .yarnrc.yml, unless packageManager says Yarn 1", async () => {
		const fs = await findings(
			repo({}, { "yarn.lock": "", ".yarnrc.yml": "nodeLinker: node-modules\n" }),
		);
		expect(find(fs, "setup.run")!.value).toBe("yarn install --immutable");
		const classic = await findings(
			repo({ packageManager: "yarn@1.22.22" }, { "yarn.lock": "", ".yarnrc.yml": "" }),
		);
		expect(find(classic, "setup.run")!.value).toBe("yarn install --frozen-lockfile");
	});

	it("the reason names packageManager without its hash", async () => {
		const fs = await findings(
			repo({ packageManager: "pnpm@10.20.0+sha512.abcdef" }, { "pnpm-lock.yaml": "" }),
		);
		expect(find(fs, "setup.run")!.reason).toBe(
			"packageManager is pnpm@10.20.0; frozen install of pnpm-lock.yaml",
		);
	});

	it("two lockfiles with packageManager: follow it, note the other", async () => {
		const fs = await findings(
			repo({ packageManager: "npm@10.0.0" }, { "package-lock.json": "", "yarn.lock": "" }),
		);
		expect(find(fs, "setup.run")).toMatchObject({ value: "npm ci", kind: "detected" });
		expect(notes(fs)).toContain("yarn.lock (yarn) also present; this draft installs with npm");
		expect(find(fs, "setup.cache_key")!.value).toEqual(["package-lock.json", "package.json"]);
	});

	it("two lockfiles without packageManager: a guess, pnpm before yarn, bun, npm", async () => {
		const fs = await findings(repo({}, { "package-lock.json": "", "yarn.lock": "" }));
		expect(find(fs, "setup.run")).toMatchObject({
			value: "yarn install --frozen-lockfile",
			kind: "guess",
			confidence: "low",
		});
	});

	it("no lockfile and no packageManager: a guess with a plain install", async () => {
		const fs = await findings(repo({}));
		expect(find(fs, "setup.run")).toMatchObject({ value: "npm install", kind: "guess" });
	});
});

// ── 2. cache_key ─────────────────────────────────────────────────────────────

describe("rule 2: cache_key", () => {
	it("a workspace keys on every package.json", async () => {
		const fs = await findings(
			repo(
				{ workspaces: ["packages/*"] },
				{ "package-lock.json": "", "packages/a/package.json": json({ name: "a" }) },
			),
		);
		expect(find(fs, "setup.cache_key")!.value).toEqual(["package-lock.json", "**/package.json"]);
	});
});

// ── 3. Workspace ─────────────────────────────────────────────────────────────

describe("rule 3: pnpm-workspace.yaml and workspaces", () => {
	it("reads block, flow, quoted and commented entries", () => {
		expect(
			parseWorkspaceYaml("packages:\n  - apps/*   # the apps\n  - \"packages/*\"\n  - 'tools/*'\n")
				.packages,
		).toEqual(["apps/*", "packages/*", "tools/*"]);
		expect(parseWorkspaceYaml("packages: [apps/*, 'libs/*']\n").packages).toEqual([
			"apps/*",
			"libs/*",
		]);
		expect(parseWorkspaceYaml("packages: ['a,b/*', c]\n").packages).toEqual(["a,b/*", "c"]);
		expect(parseWorkspaceYaml("packages:\n- apps/*\n- '!apps/old'\n").packages).toEqual([
			"apps/*",
			"!apps/old",
		]);
	});

	it("reports other keys and lines it can't read, never throws", () => {
		const ws = parseWorkspaceYaml(
			"packages:\n  - apps/*\n  - &anchor libs/*\n  - { a: b }\ncatalog:\n  vue: ^3\nonlyBuiltDependencies: [esbuild]\n%TAG x\n",
		);
		expect(ws.packages).toEqual(["apps/*"]);
		expect(ws.skippedKeys).toEqual(["catalog", "onlyBuiltDependencies"]);
		expect(ws.skippedLines).toEqual(["- &anchor libs/*", "- { a: b }", "%TAG x"]);
	});

	it("a brace or bracket glob is skipped, not read literally", () => {
		const ws = parseWorkspaceYaml("packages:\n  - 'apps/{web,docs}'\n  - libs/[ab]\n  - tools/*\n");
		expect(ws.packages).toEqual(["tools/*"]);
		expect(ws.skippedLines).toEqual(["- 'apps/{web,docs}'", "- libs/[ab]"]);
	});

	it("a skipped line becomes a finding", async () => {
		const fs = await findings(
			repo({ packageManager: "pnpm@9.0.0" }, { "pnpm-workspace.yaml": "packages:\n  - *ref\n" }),
		);
		expect(notes(fs)).toContain('pnpm-workspace.yaml: skipped "- *ref"');
	});

	it("! entries exclude, and . is never a workspace package", () => {
		expect(matchWorkspaces([".", "apps/*", "!apps/old"], ["apps/web", "apps/old", "lib"])).toEqual([
			"apps/web",
		]);
	});

	it("globs: * is one segment, ** any depth, dot directories never match", () => {
		expect(globMatch("apps/*", "apps/web")).toBe(true);
		expect(globMatch("apps/*", "apps/web/x")).toBe(false);
		expect(globMatch("apps/**", "apps/web/x")).toBe(true);
		expect(globMatch("apps/**", "apps")).toBe(true);
		expect(globMatch("**/pkg", "a/b/pkg")).toBe(true);
		expect(globMatch("*", ".old")).toBe(false);
		expect(globMatch("apps/**", "apps/.cache/x")).toBe(false);
		expect(globMatch("./theme/", "theme")).toBe(true);
	});

	it("package.json workspaces as an array and as { packages }", async () => {
		const web = {
			"apps/web/package.json": json({
				name: "web",
				scripts: { dev: "vite" },
				devDependencies: { vite: "1" },
			}),
		};
		for (const workspaces of [["apps/*"], { packages: ["apps/*"] }]) {
			const fs = await findings(repo({ workspaces }, { "package-lock.json": "", ...web }));
			expect(find(fs, "commands.dev.run")!.value).toBe(
				"npm exec --workspace web -- vite --host 127.0.0.1 --port {port} --strictPort",
			);
		}
	});
});

// ── 4–6. Apps ────────────────────────────────────────────────────────────────

const PNPM = { packageManager: "pnpm@9.0.0" };
const ws = (dirs: string): string =>
	`packages:\n${dirs
		.split(" ")
		.map((d) => `  - ${d}`)
		.join("\n")}\n`;
const pkg = (name: string, dev?: string, deps: Record<string, string> = {}): string =>
	json({ name, ...(dev ? { scripts: { dev } } : {}), dependencies: deps });

describe("rules 4–6: apps", () => {
	it("prefers packages under apps/, and skips task-runner dev scripts", async () => {
		const cfg = await config(
			repo(
				{ ...PNPM, scripts: { dev: "turbo run dev" } },
				{
					"pnpm-workspace.yaml": ws("apps/* packages/*"),
					"apps/site/package.json": pkg("site", "astro dev", { astro: "5" }),
					"packages/lib/package.json": pkg("lib", "vite build --watch", { vite: "7" }),
				},
			),
		);
		expect(Object.keys(cfg.commands)).toEqual(["dev"]);
		expect(cfg.commands.dev.run).toBe(
			"pnpm --filter site exec astro dev --host 127.0.0.1 --port {port}",
		);
	});

	it("a dev script that runs a task runner is never an app", async () => {
		for (const dev of [
			"turbo run dev",
			"nx run-many -t dev",
			"vp run website#dev",
			"lerna run dev",
		]) {
			const fs = await findings(repo({ ...PNPM, scripts: { dev } }));
			expect(find(fs, "commands.dev.run"), dev).toBeUndefined();
			expect(notes(fs)).toContain("no package with a dev script; add [commands.dev] by hand");
		}
	});

	it("the root counts only when no workspace package does, or when it runs a known framework", async () => {
		const files = {
			"pnpm-workspace.yaml": ws("apps/*"),
			"apps/docs/package.json": pkg("docs", "nuxt dev", { nuxt: "4" }),
		};
		const unknown = await config(repo({ ...PNPM, scripts: { dev: "node server.js" } }, files));
		expect(Object.keys(unknown.commands)).toEqual(["dev"]);
		expect(unknown.commands.dev.run).toContain("--filter docs");
		const known = await config(
			repo(
				{ ...PNPM, name: "root", scripts: { dev: "next dev" }, dependencies: { next: "15" } },
				files,
			),
		);
		expect(known.commands.dev.run).toContain("--filter docs"); // apps/docs before the root
		expect(known.commands.root.run).toBe("pnpm exec next dev -H 127.0.0.1 -p {port+1}");
	});

	it.each([
		["nuxt dev", "nuxt", "nuxt dev --host 127.0.0.1 --port {port}"],
		["nuxi dev", "nuxt", "nuxt dev --host 127.0.0.1 --port {port}"],
		["next dev", "next", "next dev -H 127.0.0.1 -p {port}"],
		["vite", "vite", "vite --host 127.0.0.1 --port {port} --strictPort"],
		["vite dev", "vite", "vite --host 127.0.0.1 --port {port} --strictPort"],
		["astro dev", "astro", "astro dev --host 127.0.0.1 --port {port}"],
		["storybook dev -p 6006", "storybook", "storybook dev --host 127.0.0.1 -p {port} --ci"],
	])("%s → the %s form", async (dev, dep, form) => {
		const fs = await findings(
			repo({ ...PNPM, scripts: { dev }, dependencies: { [dep]: "1" } }, { "pnpm-lock.yaml": "" }),
		);
		expect(find(fs, "commands.dev.run")).toMatchObject({
			value: `pnpm exec ${form}`,
			confidence: "high",
		});
	});

	it("medium when the package doesn't depend on the framework", async () => {
		const fs = await findings(repo({ ...PNPM, scripts: { dev: "vite" } }));
		expect(find(fs, "commands.dev.run")).toMatchObject({ kind: "detected", confidence: "medium" });
	});

	it("drops other arguments with a note, and replaces host and port", async () => {
		const fs = await findings(
			repo({
				...PNPM,
				scripts: { dev: "vite --host --port=3000 --open" },
				dependencies: { vite: "1" },
			}),
		);
		expect(find(fs, "commands.dev.run")!.value).toBe(
			"pnpm exec vite --host 127.0.0.1 --port {port} --strictPort",
		);
		expect(notes(fs)).toContain(
			'the root package dev script also passes "--open"; the draft drops it',
		);
	});

	it("a dev script with && is not a known framework", async () => {
		const fs = await findings(repo({ ...PNPM, scripts: { dev: "nuxt prepare && nuxt dev" } }));
		expect(find(fs, "commands.dev.run")!.kind).toBe("guess");
	});

	const two = (dev: string, deps: Record<string, string>) => ({
		"apps/web/package.json": pkg("web", dev, deps),
		"pnpm-workspace.yaml": ws("apps/*"),
	});
	it.each([
		[
			"pnpm",
			"pnpm --filter web exec nuxt dev --host 127.0.0.1 --port {port}",
			"pnpm --filter web run dev",
			"pnpm exec nuxt dev --host 127.0.0.1 --port {port}",
			"pnpm run dev",
		],
		[
			"npm",
			"npm exec --workspace web -- nuxt dev --host 127.0.0.1 --port {port}",
			"npm run dev --workspace web",
			"npm exec -- nuxt dev --host 127.0.0.1 --port {port}",
			"npm run dev",
		],
		[
			"yarn",
			"yarn workspace web nuxt dev --host 127.0.0.1 --port {port}",
			"yarn workspace web run dev",
			"yarn nuxt dev --host 127.0.0.1 --port {port}",
			"yarn run dev",
		],
		[
			"bun",
			"bun x nuxt dev --host 127.0.0.1 --port {port}",
			"bun run --filter web dev",
			"bun x nuxt dev --host 127.0.0.1 --port {port}",
			"bun run dev",
		],
	])(
		"%s: workspace and root commands, known and unknown",
		async (pm, wsKnown, wsUnknown, rootKnown, rootUnknown) => {
			const base = { packageManager: `${pm}@2.0.0`, workspaces: ["apps/*"] };
			const k = await config(repo(base, two("nuxt dev", { nuxt: "4" })));
			expect(k.commands.dev.run).toBe(wsKnown);
			if (pm === "bun") {
				expect(k.commands.dev.cwd).toBe("apps/web");
			}
			const u = await config(repo(base, two("node server.js", {})));
			expect(u.commands.dev).toEqual({ run: wsUnknown, env: { PORT: "{port}" } });
			const rk = await config(
				repo({
					packageManager: `${pm}@2.0.0`,
					scripts: { dev: "nuxt dev" },
					dependencies: { nuxt: "4" },
				}),
			);
			expect(rk.commands.dev.run).toBe(rootKnown);
			const ru = await config(
				repo({ packageManager: `${pm}@2.0.0`, scripts: { dev: "node server.js" } }),
			);
			expect(ru.commands.dev.run).toBe(rootUnknown);
		},
	);

	it("an unknown dev server: both lines are guesses, PORT is set", async () => {
		const { text } = await draft(repo({ ...PNPM, scripts: { dev: "node server.js" } }));
		expect(text).toMatch(/^run = "pnpm run dev" {2}# guess: /m);
		expect(text).toMatch(/^PORT = "\{port\}" {2}# guess: /m);
		expect(text).not.toContain("node server.js");
	});

	it("main app order: apps/web, apps/docs, the root, then path order; ports and {port+i}", async () => {
		const cfg = await config(
			repo(PNPM, {
				"pnpm-workspace.yaml": ws("apps/*"),
				"apps/a/package.json": pkg("a", "vite", { vite: "1" }),
				"apps/docs/package.json": pkg("docs", "vite", { vite: "1" }),
				"apps/web/package.json": pkg("web", "vite", { vite: "1" }),
			}),
		);
		expect(cfg.ports).toBe(3);
		expect(cfg.commands.dev.run).toContain(
			"--filter web exec vite --host 127.0.0.1 --port {port} ",
		);
		expect(cfg.commands.docs.run).toContain("--port {port+1} ");
		expect(cfg.commands.a.run).toContain("--port {port+2} ");
	});

	it("names: scope dropped, lower-cased, sanitised; a clash uses the directory", async () => {
		const cfg = await config(
			repo(PNPM, {
				"pnpm-workspace.yaml": ws("apps/*"),
				"apps/docs/package.json": pkg("docs", "vite", { vite: "1" }),
				"apps/x/package.json": pkg("@Acme/My.App", "vite", { vite: "1" }),
				"apps/test/package.json": pkg("test", "vite", { vite: "1" }),
			}),
		);
		expect(Object.keys(cfg.commands)).toEqual(["dev", "apps-test", "my-app"]);
	});

	it("more than 10 apps: keeps 10 and notes the rest", async () => {
		const files: Record<string, string> = { "pnpm-workspace.yaml": ws("apps/*") };
		for (let i = 10; i < 22; i++) {
			files[`apps/a${i}/package.json`] = pkg(`a${i}`, "vite", { vite: "1" });
		}
		const fs = await findings(repo(PNPM, files));
		expect(find(fs, "ports")!.value).toBe(10);
		expect(notes(fs)).toContain("more than 10 apps; skipped apps/a20, apps/a21");
	});

	it("a { in a package name stays literal, so it can't name a template variable", async () => {
		const cfg = await config(
			repo(PNPM, {
				"pnpm-workspace.yaml": ws("apps/*"),
				"apps/web/package.json": pkg("{port}", "nuxt dev", { nuxt: "4" }),
				"apps/x/package.json": pkg("{nope}", "node s.js"),
			}),
		);
		expect(cfg.commands.dev.run).toBe(
			"pnpm --filter '{{port}' exec nuxt dev --host 127.0.0.1 --port {port}",
		);
		expect(Object.values(cfg.commands).map((c: any) => c.run)).toContain(
			"pnpm --filter '{{nope}' run dev",
		);
	});

	it("a package name with shell syntax is quoted", async () => {
		const cfg = await config(
			repo(PNPM, {
				"pnpm-workspace.yaml": ws("apps/*"),
				"apps/web/package.json": pkg("x;rm -rf $(pwd)", "node s.js"),
			}),
		);
		expect(cfg.commands.dev.run).toBe("pnpm --filter 'x;rm -rf $(pwd)' run dev");
	});
});

// ── 7. Build before dev ──────────────────────────────────────────────────────

describe("rule 7: build before dev", () => {
	const base = {
		"pnpm-workspace.yaml": ws("apps/*"),
		"apps/web/package.json": pkg("web", "nuxt dev", { nuxt: "4" }),
	};

	it("turbo.json appends a build of the main app's dependencies", async () => {
		const fs = await findings(
			repo(
				{ ...PNPM, packageManager: "npm@10.0.0", workspaces: ["apps/*"] },
				{ ...base, "turbo.json": "{}" },
			),
		);
		expect(find(fs, "setup.run")!.value).toBe(
			"npm install && npx turbo run build --filter=web^...",
		);
	});

	it("no build step when the main app is the root", async () => {
		const fs = await findings(
			repo({ ...PNPM, name: "site", scripts: { dev: "nuxt dev" } }, { "turbo.json": "{}" }),
		);
		expect(find(fs, "setup.run")!.value).toBe("pnpm install");
	});

	it.each([
		["nx.json", { "nx.json": "{}" }, {}, "nx (nx.json)"],
		["vite-plus", {}, { devDependencies: { "vite-plus": "1" } }, "vite-plus (vp)"],
		["a vp script", {}, { scripts: { build: "vp run -r build" } }, "vite-plus (vp)"],
		["lerna.json", { "lerna.json": "{}" }, {}, "lerna (lerna.json)"],
	])("%s → a note, no build guess", async (_label, extra, rootFields, runner) => {
		const fs = await findings(
			repo({ ...PNPM, ...rootFields }, { ...base, "turbo.json": "{}", ...extra }),
		);
		expect(find(fs, "setup.run")).toMatchObject({ value: "pnpm install", kind: "detected" });
		expect(notes(fs)).toContain(
			`${runner} runs this repo's tasks; the draft doesn't guess a build step before dev`,
		);
	});
});

// ── 8–10 ─────────────────────────────────────────────────────────────────────

describe("rule 8: seed files", () => {
	it("each .env*.example adds its real name, sorted", async () => {
		const fs = await findings(
			repo(PNPM, {
				"b/.env.example": "",
				".env.local.example": "",
				".env.example": "",
				"x.env.example": "",
			}),
			{ repo: REPO, project: "app" },
		);
		const seeds = find(fs, "setup.seed_files")!;
		expect(seeds.value).toEqual([".env", ".env.local", "b/.env"]);
		expect(seeds.reason).toContain("set seed_from in app.toml");
	});
});

describe("rule 9: test and check", () => {
	it.each([
		["pnpm", "pnpm test", "pnpm lint && pnpm format:check && pnpm typecheck"],
		["npm", "npm test", "npm run lint && npm run format:check && npm run typecheck"],
		["yarn", "yarn run test", "yarn run lint && yarn run format:check && yarn run typecheck"],
		["bun", "bun run test", "bun run lint && bun run format:check && bun run typecheck"],
	])("%s", async (pm, test, check) => {
		const scripts = {
			test: "x",
			lint: "x",
			"format:check": "x",
			typecheck: "x",
			"check-types": "x",
		};
		const cfg = await config(repo({ packageManager: `${pm}@1.0.0`, scripts }));
		expect(cfg.commands.test.run).toBe(test);
		expect(cfg.commands.check.run).toBe(check);
	});

	it("a check script wins", async () => {
		const cfg = await config(repo({ ...PNPM, scripts: { check: "x", lint: "x" } }));
		expect(cfg.commands.check.run).toBe("pnpm check");
	});

	it("Yarn runs scripts with run, since Yarn 1's built-in check beats a check script", async () => {
		const cfg = await config(
			repo({ packageManager: "yarn@1.22.22", scripts: { check: "x" } }, { "yarn.lock": "" }),
		);
		expect(cfg.commands.check.run).toBe("yarn run check");
	});

	it("check-types when there's no typecheck; nothing when no script exists", async () => {
		expect(
			(await config(repo({ ...PNPM, scripts: { "check-types": "x" } }))).commands.check.run,
		).toBe("pnpm check-types");
		expect((await config(repo(PNPM))).commands).toBeUndefined();
	});
});

describe("rule 10: conductor.toml", () => {
	it("a broken file is a note, never an error", async () => {
		const fs = await findings(repo(PNPM, { "conductor.toml": "[scripts\n" }));
		expect(notes(fs)).toContain("conductor.toml is not valid TOML; skipped");
	});
});

// ── Comments, escaping and validation ────────────────────────────────────────

describe("rule 11: escaping and validation", () => {
	it("a package name with ESC and a newline round-trips, escaped", async () => {
		const evil = "web\u001b[2J\nx";
		const d = await draft(
			repo(PNPM, {
				"pnpm-workspace.yaml": ws("apps/*"),
				"apps/web/package.json": pkg(evil, "node s.js"),
			}),
		);
		expect(d.text).not.toContain("\u001b");
		expect(d.text).toContain(String.raw`\u001b`);
		const parsed = parseToml(d.text) as any;
		expect(RawProjectSchema.safeParse(parsed).success).toBe(true);
		expect(parsed.commands.dev.run).toBe(`pnpm --filter 'web\u001b[2J\nx' run dev`);
	});

	it("tomlText escapes controls, quotes and backslashes", () => {
		expect(tomlText('a"b\\c\u0007‮')).toBe(String.raw`"a\"b\\c\u0007\u202e"`);
	});

	it("a draft that doesn't validate is E_INTERNAL, never returned", async () => {
		setDraftTransform((t) => `${t}\n[hooks]\nnot_a_hook = "x"\n`);
		await expect(draft(F2_SINGLE_NUXT)).rejects.toMatchObject({ errCode: "E_INTERNAL" });
	});

	it("a draft with a bad command name says which rule it breaks", () => {
		expect(() => validateDraft(`repo = "x"\n[commands."Bad Name"]\nrun = "x"\n`, false)).toThrow(
			"config detect wrote a draft that doesn't validate: commands.Bad Name: must match ^[a-z0-9][a-z0-9:_-]*$",
		);
	});

	it("no package.json: a valid draft with one note", async () => {
		const d = await renderDraft(await findings({ "README.md": "x" }), { source: "test" });
		expect(notes(d.findings)).toEqual(["no package.json at the root; nothing else to detect"]);
		expect(Object.keys(d.config)).toEqual(["repo"]);
	});
});

describe("repo line and argument rule", () => {
	it("a path's repo comes from package.json repository, as a guess, else a placeholder", async () => {
		const fs = await findings(repo({ repository: "github:acme/app" }), {});
		expect(find(fs, "repo")).toMatchObject({
			value: "https://github.com/acme/app.git",
			kind: "guess",
		});
		expect(find(await findings(repo({}), {}), "repo")).toMatchObject({
			value: "git@github.com:ORG/REPO.git",
			kind: "guess",
		});
	});

	it.each([
		[
			"git+https://github.com/uxfront-com/testlane.git",
			"https://github.com/uxfront-com/testlane.git",
		],
		["git@github.com:acme/app.git", "https://github.com/acme/app.git"],
		["https://gitlab.com/acme/app", "https://gitlab.com/acme/app.git"],
		["not a url", null],
	])("normaliseRepoUrl(%s)", (input, out) => {
		expect(normaliseRepoUrl(input)).toBe(out);
	});

	it.each([
		[undefined, true],
		[".", true],
		["..", true],
		["./app", true],
		["~/dev/app", true],
		["a/b", true],
		["app", false],
		["my.app", false],
	])("isPathArgument(%s) is %s", (arg, path) => {
		expect(isPathArgument(arg)).toBe(path);
	});
});
