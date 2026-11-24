// `config detect` (§9.12): draft a project config from a repo's own files.
// Pure functions over a read-only file interface, so the rules are tested
// without git. Detection only reads files: it runs nothing from the repo, and
// it never reads a lockfile's content, only whether one is there.

import { parse as parseToml } from "smol-toml";
import { shellQuote } from "../lib/shell.ts";
import { matchWorkspaces, parseWorkspaceYaml } from "./detect-parse.ts";

/** A read-only view of a repo's files: a checkout, a commit, or a map in a test. */
export interface RepoFiles {
  /** Every regular file, repo-relative with `/`, outside the `node_modules` and `.git` directories. Symlinks are left out. */
  list(): Promise<Array<string>>;
  /** UTF-8 text, or null when the file is absent. Throws E_CONFIG for a file over 1 MiB. */
  read(path: string): Promise<string | null>;
  exists(path: string): Promise<boolean>;
  /** Get `paths` ready to read in one go, where a read can be slow on its own, like in a partial clone. */
  prefetch?(paths: Array<string>): Promise<void>;
}

/** The root files `detect` reads, besides each workspace's `package.json`. */
const ROOT_READS = new Set(["package.json", "pnpm-workspace.yaml", "conductor.toml"]);

/** Files from a map: the adapter the unit tests use. */
export function memoryFiles(files: Record<string, string>): RepoFiles {
  const paths = Object.keys(files)
    .filter((p) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(p))
    .sort();
  return {
    list: async () => paths,
    read: async (p) => (Object.hasOwn(files, p) ? files[p]! : null),
    exists: async (p) => Object.hasOwn(files, p),
  };
}

export type Confidence = "high" | "medium" | "low";
export type FindingKind = "detected" | "guess" | "note";

/** One line of the draft: a key with its value, or a note. */
export interface Finding {
  /** Dotted TOML path (`setup.run`, `commands.dev.env.PORT`), or null for a note. */
  key: string | null;
  value: unknown;
  kind: FindingKind;
  confidence: Confidence;
  reason: string;
  /** For a note: the key it sits above in the TOML, or none for the top of the file. */
  at?: string;
}

export interface DetectOptions {
  /** The project's `repo`, and why: `<project>.toml`, or the URL `config add` was given. */
  repo?: { value: string; reason: string };
  /** The project name, for the `seed_from` advice. */
  project?: string;
}

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

interface Pkg {
  /** Repo-relative directory; "" for the root. */
  dir: string;
  name?: string;
  scripts: Record<string, string>;
  deps: Set<string>;
  packageManager?: string;
  repository?: string;
}

interface App {
  pkg: Pkg;
  command: string;
  framework?: Framework;
  confidence: Confidence;
  reason: string;
  /** Arguments the dev script had that the draft drops. */
  dropped: Array<string>;
}

type Framework = "nuxt" | "next" | "vite" | "astro" | "storybook";

const LOCKFILES: Array<[string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
];

const PM_ORDER: Array<PackageManager> = ["pnpm", "yarn", "bun", "npm"];
const MAX_APPS = 10;
const PLACEHOLDER_REPO = "git@github.com:ORG/REPO.git";
const ENV_EXAMPLE = /^\.env(\..+)?\.example$/;
const TASK_RUNNER = /(^|[\s;&|(])(turbo|vp|nx|lerna)(\s|$)/;

/**
 * The findings for a repo, in the order the draft prints them. Every key the
 * draft sets is one finding; notes carry what the draft leaves to the reader.
 */
export async function detect(files: RepoFiles, opts: DetectOptions = {}): Promise<Array<Finding>> {
  const out: Array<Finding> = [];
  const key = (k: string, value: unknown, confidence: Confidence, reason: string): void => {
    out.push({ key: k, value, kind: confidence === "low" ? "guess" : "detected", confidence, reason });
  };
  const note = (reason: string, at?: string): void => {
    out.push({ key: null, value: null, kind: "note", confidence: "high", reason, ...(at && { at }) });
  };

  const list = await files.list();
  // Everything below reads at most these files, so ask for them all at once.
  await files.prefetch?.(list.filter((p) => p.endsWith("/package.json") || ROOT_READS.has(p)));
  const rootText = await files.read("package.json");
  const root = rootText === null ? null : parsePkg("", rootText);

  // ── repo ───────────────────────────────────────────────────────────────────
  if (opts.repo) {
    key("repo", opts.repo.value, "high", opts.repo.reason);
  } else {
    const fromPkg = root?.repository ? normaliseRepoUrl(root.repository) : null;
    if (fromPkg) {key("repo", fromPkg, "low", "package.json repository.url");}
    else {key("repo", PLACEHOLDER_REPO, "low", "no repository URL found; replace it");}
  }

  if (rootText === null) {
    note("no package.json at the root; nothing else to detect");
    return out;
  }
  if (root === null) {
    note("package.json at the root is not valid JSON; nothing else to detect");
    return out;
  }

  // ── 1. Package manager ─────────────────────────────────────────────────────
  const locks = LOCKFILES.filter(([f]) => list.includes(f));
  const lockManagers = [...new Set(locks.map(([, pm]) => pm))];
  const fieldMatch = root.packageManager?.match(/^(pnpm|npm|yarn|bun)@(\S+)$/);
  let pm: PackageManager;
  let pmConfidence: Confidence;
  let pmReason: string;
  if (fieldMatch) {
    pm = fieldMatch[1] as PackageManager;
    pmConfidence = "high";
    pmReason = `packageManager is ${fieldMatch[1]}@${fieldMatch[2]!.split("+")[0]}`;
  } else if (lockManagers.length === 1) {
    pm = lockManagers[0]!;
    pmConfidence = "high";
    pmReason = `${locks[0]![0]} is the only lockfile`;
  } else if (lockManagers.length > 1) {
    const owner = list.includes("pnpm-workspace.yaml") && lockManagers.includes("pnpm") ? "pnpm" : undefined;
    pm = owner ?? PM_ORDER.find((m) => lockManagers.includes(m))!;
    pmConfidence = "low";
    pmReason = owner
      ? `several lockfiles and no packageManager; pnpm-workspace.yaml points to pnpm`
      : `several lockfiles and no packageManager; picked ${pm}`;
  } else {
    pm = list.includes("pnpm-workspace.yaml") ? "pnpm" : "npm";
    pmConfidence = "low";
    pmReason = "no lockfile and no packageManager";
  }
  const lockfile = locks.find(([, m]) => m === pm)?.[0];
  const others = locks.flatMap(([f, m]) => (m === pm ? [] : [f]));
  if (others.length) {
    const how = others.map((f) => `${f} (${LOCKFILES.find(([l]) => l === f)![1]})`).join(", ");
    note(`${how} also present; this draft installs with ${pm}`, "setup.run");
  }

  // ── 3. Workspace ───────────────────────────────────────────────────────────
  let patterns: Array<string> | undefined;
  let patternSource = "";
  const wsText = await files.read("pnpm-workspace.yaml");
  if (wsText !== null) {
    const ws = parseWorkspaceYaml(wsText);
    const skipped = [...ws.skippedKeys, ...ws.skippedLines.map((l) => JSON.stringify(l))];
    if (skipped.length) {note(`pnpm-workspace.yaml: skipped ${skipped.join(", ")}`);}
    if (ws.packages !== undefined) {
      patterns = ws.packages;
      patternSource = "pnpm-workspace.yaml";
    }
  }
  if (patterns === undefined && rootText !== null) {
    const ws = workspacesField(rootText);
    if (ws) {
      patterns = ws;
      patternSource = "package.json workspaces";
    }
  }
  const pkgDirs = list
    .filter((p) => p.endsWith("/package.json"))
    .map((p) => p.slice(0, -"/package.json".length));
  const wsDirs = patterns ? matchWorkspaces(patterns, pkgDirs).sort() : [];
  const pkgs: Array<Pkg> = [];
  for (const dir of wsDirs) {
    const text = await files.read(`${dir}/package.json`);
    const pkg = text === null ? null : parsePkg(dir, text);
    if (pkg === null) {note(`${dir}/package.json is not valid JSON; skipped`);}
    else {pkgs.push(pkg);}
  }
  const isWorkspace = pkgs.length > 0;

  // ── 2. Install and cache_key ───────────────────────────────────────────────
  // An explicit `packageManager: yarn@<n>` decides; only without one does `.yarnrc.yml` mean Yarn 2+.
  const yarnBerry =
    pm === "yarn" &&
    (fieldMatch?.[1] === "yarn" ? Number(fieldMatch[2]!.split(".")[0]) >= 2 : list.includes(".yarnrc.yml"));
  const install = lockfile
    ? {
        pnpm: "pnpm install --frozen-lockfile",
        npm: "npm ci",
        yarn: yarnBerry ? "yarn install --immutable" : "yarn install --frozen-lockfile",
        bun: "bun install --frozen-lockfile",
      }[pm]
    : `${pm} install`;
  const installReason = lockfile ? `${pmReason}; frozen install of ${lockfile}` : `${pmReason}; nothing to freeze`;

  // ── 4–6. Apps, framework and port, names ───────────────────────────────────
  const { apps, left, unnamed } = findApps(root, pkgs, pm);
  for (const p of unnamed) {note(`${p.dir}/package.json has a dev script but no name; skipped`);}
  if (left.length) {note(`more than ${MAX_APPS} apps; skipped ${left.map((p) => p.dir).join(", ")}`);}
  const runner = taskRunner(list, root);
  const main = apps[0];

  // ── 7. Build before dev ────────────────────────────────────────────────────
  let setupRun = install;
  const setupConfidence: Confidence = pmConfidence;
  let setupReason = installReason;
  if (runner) {
    note(`${runner} runs this repo's tasks; the draft doesn't guess a build step before dev`, "setup.run");
  } else if (list.includes("turbo.json") && main && main.pkg.dir !== "" && main.pkg.name) {
    const exec = { pnpm: "pnpm turbo", npm: "npx turbo", yarn: "yarn turbo", bun: "bunx turbo" }[pm];
    setupRun += ` && ${exec} run build --filter=${shellQuote(main.pkg.name)}^...`;
    // setup.run isn't templated (§5.5), so the name needs no `{{` here.
    setupReason += `; turbo.json builds ${main.pkg.name}'s dependencies`;
  }
  const postinstalls = [root, ...pkgs].filter((p) => p.scripts.postinstall !== undefined);
  for (const p of postinstalls) {
    const where = p.dir === "" ? "package.json" : `${p.dir}/package.json`;
    note(`the install runs ${where} postinstall ${JSON.stringify(p.scripts.postinstall)}`, "setup.run");
  }
  key("setup.run", setupRun, setupConfidence, setupReason);

  const cacheKey = [
    ...(lockfile ? [lockfile] : []),
    ...(list.includes("pnpm-workspace.yaml") ? ["pnpm-workspace.yaml"] : []),
    isWorkspace ? "**/package.json" : "package.json",
  ];
  key(
    "setup.cache_key",
    cacheKey,
    pmConfidence === "low" ? "low" : "high",
    isWorkspace ? `the lockfile and every package.json of the ${patternSource} packages` : "the lockfile and package.json",
  );

  // ── 8. Seed files ──────────────────────────────────────────────────────────
  const examples = list.filter((p) => ENV_EXAMPLE.test(p.slice(p.lastIndexOf("/") + 1))).sort();
  if (examples.length) {
    const seeds = examples.map((p) => p.slice(0, -".example".length));
    key(
      "setup.seed_files",
      seeds,
      "high",
      `${examples.join(", ")}; set seed_from in ${opts.project ?? "<project>"}.toml to a folder that holds the real files`,
    );
  }

  // ── env ────────────────────────────────────────────────────────────────────
  const nuxt = apps.find((a) => a.framework === "nuxt");
  if (nuxt) {key("env.NUXT_TELEMETRY_DISABLED", "1", "high", `${where(nuxt.pkg)} runs Nuxt`);}

  // ── commands ───────────────────────────────────────────────────────────────
  if (apps.length > 1) {key("ports", apps.length, "high", `${apps.length} apps, one port each`);}
  if (apps.length === 0) {note("no package with a dev script; add [commands.dev] by hand");}
  const names = new Set<string>(["test", "check"]);
  apps.forEach((app, i) => {
    const name = i === 0 ? "dev" : commandName(app.pkg, names);
    names.add(name);
    const port = portVar(i);
    const prefix = `commands.${name}`;
    for (const arg of app.dropped) {
      note(`${where(app.pkg)} dev script also passes ${JSON.stringify(arg)}; the draft drops it`, `${prefix}.run`);
    }
    const why = i === 0 ? `${app.reason}; the main app (${where(app.pkg)})` : app.reason;
    if (app.framework) {
      key(`${prefix}.run`, app.command, app.confidence, why);
      if (app.pkg.dir !== "" && pm === "bun") {key(`${prefix}.cwd`, literal(app.pkg.dir), app.confidence, `bun x runs in ${app.pkg.dir}`);}
    } else {
      key(`${prefix}.run`, app.command, "low", why);
      key(`${prefix}.env.PORT`, port, "low", "unknown dev server; assumes it reads PORT");
    }
  });

  // ── 9. Extra commands ──────────────────────────────────────────────────────
  // Yarn 1 runs its own built-in (`yarn check`) over a script of the same name, so Yarn always says `run`.
  const script = (s: string): string =>
    pm === "npm" ? (s === "test" ? "npm test" : `npm run ${s}`) : pm === "pnpm" ? `pnpm ${s}` : `${pm} run ${s}`;
  if (root.scripts.test !== undefined) {key("commands.test.run", script("test"), "high", "package.json has a test script");}
  if (root.scripts.check !== undefined) {
    key("commands.check.run", script("check"), "high", "package.json has a check script");
  } else {
    const typecheck = root.scripts.typecheck !== undefined ? "typecheck" : root.scripts["check-types"] !== undefined ? "check-types" : undefined;
    const parts = ["lint", "format:check", ...(typecheck ? [typecheck] : [])].filter((s) => root.scripts[s] !== undefined);
    if (parts.length) {
      key("commands.check.run", parts.map(script).join(" && "), "high", `package.json scripts ${parts.join(", ")}`);
    }
  }

  // ── 10. Hints from other tools ─────────────────────────────────────────────
  const conductor = await files.read("conductor.toml");
  if (conductor !== null) {
    try {
      const parsed = parseToml(conductor) as { scripts?: Record<string, unknown> };
      for (const s of ["setup", "run"]) {
        const v = parsed.scripts?.[s];
        if (typeof v === "string") {note(`conductor.toml ${s} runs ${JSON.stringify(v)}`);}
      }
    } catch {
      note("conductor.toml is not valid TOML; skipped");
    }
  }

  return out;
}

// ── Packages ─────────────────────────────────────────────────────────────────

/** The string-valued entries of a package.json object field, like `scripts`. */
const stringEntries = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, s] of Object.entries(v)) {if (typeof s === "string") {out[k] = s;}}
  }
  return out;
};

function parsePkg(dir: string, text: string): Pkg | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {return null;}
  const j = json as Record<string, unknown>;
  const deps = new Set<string>();
  for (const field of ["dependencies", "devDependencies"]) {
    for (const k of Object.keys(stringEntries(j[field]))) {deps.add(k);}
  }
  const repo = j.repository;
  const repository =
    typeof repo === "string" ? repo : repo && typeof repo === "object" ? (repo as { url?: unknown }).url : undefined;
  return {
    dir,
    ...(typeof j.name === "string" && j.name !== "" && { name: j.name }),
    scripts: stringEntries(j.scripts),
    deps,
    ...(typeof j.packageManager === "string" && { packageManager: j.packageManager }),
    ...(typeof repository === "string" && { repository }),
  };
}

function workspacesField(text: string): Array<string> | undefined {
  try {
    const ws = (JSON.parse(text) as { workspaces?: unknown }).workspaces;
    const list = Array.isArray(ws) ? ws : ws && typeof ws === "object" ? (ws as { packages?: unknown }).packages : undefined;
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : undefined;
  } catch {
    return undefined;
  }
}

function where(pkg: Pkg): string {
  return pkg.dir === "" ? "the root package" : pkg.dir;
}

/** `git+https://github.com/o/r.git`, `github:o/r`, `git@github.com:o/r` → `https://github.com/o/r.git`. */
export function normaliseRepoUrl(url: string): string | null {
  const u = url.trim();
  const short = u.match(/^(?:github:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (short) {return `https://github.com/${short[1]}/${short[2]!.replace(/\.git$/, "")}.git`;}
  const m = u.match(/^(?:git\+)?(?:https?|git|ssh):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?(?:[#?].*)?$/);
  if (m) {return `https://${m[1]}/${m[2]}/${m[3]}.git`;}
  const scp = u.match(/^(?:git\+)?[^@\s]+@([^:/\s]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (scp) {return `https://${scp[1]}/${scp[2]}/${scp[3]}.git`;}
  return null;
}

// ── Apps ─────────────────────────────────────────────────────────────────────

/** The apps, main app first; the packages past the cap; and those with no name to filter on. */
function findApps(root: Pkg, pkgs: Array<Pkg>, pm: PackageManager): { apps: Array<App>; left: Array<Pkg>; unnamed: Array<Pkg> } {
  const hasDev = (p: Pkg) => p.scripts.dev !== undefined && !TASK_RUNNER.test(p.scripts.dev);
  let candidates = pkgs.filter(hasDev);
  const inApps = candidates.filter((p) => p.dir.startsWith("apps/"));
  if (inApps.length) {candidates = inApps;}
  const rootFramework = hasDev(root) ? framework(root.scripts.dev!) : undefined;
  const rootCounts = hasDev(root) && (candidates.length === 0 || rootFramework !== undefined);
  // pm filters by package name, so a workspace package without one can't be run.
  const unnamed = candidates.filter((p) => p.name === undefined);
  const all = [...(rootCounts ? [root] : []), ...candidates.filter((p) => p.name !== undefined)];
  const rank = (p: Pkg): number => (p.dir === "apps/web" ? 0 : p.dir === "apps/docs" ? 1 : p.dir === "" ? 2 : 3);
  const sorted = all.slice().sort((a, b) => rank(a) - rank(b) || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  return { apps: sorted.slice(0, MAX_APPS).map((p, i) => app(p, pm, portVar(i))), left: sorted.slice(MAX_APPS), unnamed };
}

function framework(dev: string): { fw: Framework; args: Array<string> } | undefined {
  if (/&&|\|\||;|\||[<>`]|\$\(/.test(dev)) {return undefined;}
  const words = dev.trim().split(/\s+/);
  const [a, b] = words;
  if ((a === "nuxt" || a === "nuxi") && b === "dev") {return { fw: "nuxt", args: words.slice(2) };}
  if (a === "next" && b === "dev") {return { fw: "next", args: words.slice(2) };}
  if (a === "astro" && b === "dev") {return { fw: "astro", args: words.slice(2) };}
  if (a === "storybook" && b === "dev") {return { fw: "storybook", args: words.slice(2) };}
  if (a === "vite") {
    if (b === undefined) {return { fw: "vite", args: [] };}
    if (b === "dev" || b === "serve") {return { fw: "vite", args: words.slice(2) };}
    if (b.startsWith("-")) {return { fw: "vite", args: words.slice(1) };}
  }
  return undefined;
}

/** The template variable for the i-th app's port: `{port}`, `{port+1}`, … */
function portVar(i: number): string {
  return i === 0 ? "{port}" : `{port+${i}}`;
}

/** Repo text inside a templated value: `{{` keeps a `{` literal (§5.5), so a name can't name a variable. */
function literal(text: string): string {
  return text.replaceAll('{', "{{");
}

const FORMS: Record<Framework, (port: string) => string> = {
  nuxt: (port) => `nuxt dev --host 127.0.0.1 --port ${port}`,
  next: (port) => `next dev -H 127.0.0.1 -p ${port}`,
  vite: (port) => `vite --host 127.0.0.1 --port ${port} --strictPort`,
  astro: (port) => `astro dev --host 127.0.0.1 --port ${port}`,
  storybook: (port) => `storybook dev --host 127.0.0.1 -p ${port} --ci`,
};

/** Flags the draft sets itself; each takes a value unless listed in BARE_FLAGS. */
const OWN_FLAGS = new Set(["--host", "--hostname", "-H", "--port", "-p", "--strictPort", "--strict-port", "--ci"]);
const BARE_FLAGS = new Set(["--strictPort", "--strict-port", "--ci"]);

function droppedArgs(args: Array<string>): Array<string> {
  const dropped: Array<string> = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (OWN_FLAGS.has(name)) {
      // `--host` alone is valid for vite; a value never starts with `-`.
      const next = args[i + 1];
      if (!arg.includes("=") && !BARE_FLAGS.has(name) && next !== undefined && !next.startsWith("-")) {i += 1;}
      continue;
    }
    dropped.push(arg);
  }
  return dropped;
}

function dependsOn(pkg: Pkg, fw: Framework): boolean {
  if (fw === "storybook") {return pkg.deps.has("storybook") || [...pkg.deps].some((d) => d.startsWith("@storybook/"));}
  if (fw === "nuxt") {return pkg.deps.has("nuxt") || pkg.deps.has("nuxi");}
  return pkg.deps.has(fw);
}

function app(pkg: Pkg, pm: PackageManager, port: string): App {
  const dev = pkg.scripts.dev!;
  const found = framework(dev);
  const isRoot = pkg.dir === "";
  const name = pkg.name === undefined ? "" : literal(shellQuote(pkg.name));
  if (found) {
    const cmd = FORMS[found.fw](port);
    const command = isRoot
      ? { pnpm: `pnpm exec ${cmd}`, npm: `npm exec -- ${cmd}`, yarn: `yarn ${cmd}`, bun: `bun x ${cmd}` }[pm]
      : {
          pnpm: `pnpm --filter ${name} exec ${cmd}`,
          npm: `npm exec --workspace ${name} -- ${cmd}`,
          yarn: `yarn workspace ${name} ${cmd}`,
          bun: `bun x ${cmd}`,
        }[pm];
    const depends = dependsOn(pkg, found.fw);
    return {
      pkg,
      command,
      framework: found.fw,
      confidence: depends ? "high" : "medium",
      reason: `${where(pkg)} dev runs ${found.fw}${depends ? ` and depends on it` : ""}`,
      dropped: droppedArgs(found.args),
    };
  }
  const command = isRoot
    ? { pnpm: "pnpm run dev", npm: "npm run dev", yarn: "yarn run dev", bun: "bun run dev" }[pm]
    : {
        pnpm: `pnpm --filter ${name} run dev`,
        npm: `npm run dev --workspace ${name}`,
        yarn: `yarn workspace ${name} run dev`,
        bun: `bun run --filter ${name} dev`,
      }[pm];
  return { pkg, command, confidence: "low", reason: `${where(pkg)} has a dev script of an unknown server`, dropped: [] };
}

/** Lower-case, with anything but letters, digits, `:`, `_` and `-` replaced by `-`. */
const commandSlug = (s: string): string =>
  s
    .toLowerCase()
    .replaceAll(/[^a-z0-9:_-]/g, "-")
    .replace(/^[^a-z0-9]+/, "");

/** A command name from a package name; on a clash, from its directory. */
function commandName(pkg: Pkg, taken: Set<string>): string {
  const fromName = pkg.name ? commandSlug(pkg.name.replace(/^@[^/]+\//, "")) : "";
  if (fromName && !taken.has(fromName)) {return fromName;}
  const fromDir = commandSlug(pkg.dir === "" ? "root" : pkg.dir);
  let candidate = fromDir || "app";
  for (let n = 2; taken.has(candidate); n++) {candidate = `${fromDir || "app"}-${n}`;}
  return candidate;
}

/** The task runner that isn't turbo, when one drives the repo: the draft notes it and guesses no build. */
function taskRunner(list: Array<string>, root: Pkg): string | undefined {
  if (list.includes("nx.json")) {return "nx (nx.json)";}
  const vp = root.deps.has("vite-plus") || Object.values(root.scripts).some((s) => /^vp\s/.test(s));
  if (vp) {return "vite-plus (vp)";}
  if (list.includes("lerna.json")) {return "lerna (lerna.json)";}
  return undefined;
}

/**
 * How `config detect` reads its argument: a path when it holds a `/`, is `.`
 * or `..`, or starts with `~`; otherwise a project name. No argument means `.`.
 */
export function isPathArgument(arg: string | undefined): boolean {
  if (arg === undefined) {return true;}
  return arg.includes("/") || arg === "." || arg === ".." || arg.startsWith("~");
}
