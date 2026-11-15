// `config detect`, `config add <url> --detect` and `setup --detect` (§9.12)
// against real directories and a real fixture origin.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseToml } from "smol-toml";
import { makeEnv, makeFixtureOrigin, type FixtureOrigin, type Harness } from "../fixtures.ts";
import { setProcRecorder } from "../../src/lib/proc.ts";
import { setDraftTransform } from "../../src/config/detect-emit.ts";
import { gitFiles, localFiles } from "../../src/core/repo-files.ts";
import { defaultProjectTemplate } from "../../src/lib/project-template.ts";
import { F1_PNPM_TURBO } from "../unit/detect-fixtures.ts";

// F1's shape, plus scripts and package-manager files that would leave a marker
// file behind if anything ran them.
const REPO_FILES: Record<string, string> = {
  ...F1_PNPM_TURBO,
  "package.json": JSON.stringify({
    ...JSON.parse(F1_PNPM_TURBO["package.json"]!),
    scripts: {
      ...JSON.parse(F1_PNPM_TURBO["package.json"]!).scripts,
      prepare: "touch pwned-prepare",
      postinstall: "touch pwned-postinstall",
      build: "touch pwned-build",
    },
  }),
  "apps/api/package.json": JSON.stringify({ name: "api", scripts: { dev: "touch pwned-dev", postinstall: "touch pwned-api" } }),
  ".npmrc": "script-shell=/bin/false\n",
  ".yarnrc.yml": "yarnPath: pwned.cjs\n",
};

let tmp: string;
let env: Harness;
let recorded: string[][];

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "testlane-detect-")));
  recorded = [];
  setProcRecorder((argv) => recorded.push(argv));
});

afterEach(() => {
  setProcRecorder(null);
  setDraftTransform(null);
  rmSync(tmp, { recursive: true, force: true });
});

function writeTree(dir: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

/** Every path under `dir` with its mtime, so a test can prove nothing was written. */
function snapshot(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      out.push(`${p} ${statSync(p).mtimeMs}`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

function markers(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("pwned")) found.push(join(d, e.name));
      if (e.isDirectory()) walk(join(d, e.name));
    }
  };
  walk(dir);
  return found;
}

const git = (dir: string, ...args: string[]) => spawnSync("git", ["-C", dir, ...args]).stdout.toString();
const READ_ONLY_GIT = new Set(["ls-tree", "cat-file", "rev-parse", "symbolic-ref", "ls-remote", "config"]);
const gitSubcommand = (argv: string[]) => (argv[1] === "-C" ? argv[3] : argv[1]);

// ── config detect <path> ─────────────────────────────────────────────────────

describe("config detect <path>", () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmp, "checkout");
    writeTree(dir, REPO_FILES);
    env = makeEnv(tmp, {});
  });

  it("prints a TOML draft, writes nothing and spawns nothing", async () => {
    const before = [snapshot(dir), snapshot(env.configDir), snapshot(env.stateHome)];
    const r = await env.run(["config", "detect", dir]);
    expect(r.code, r.stderr).toBe(0);
    const cfg = parseToml(r.stdout) as any;
    expect(cfg.commands.dev.run).toBe("pnpm --filter web exec nuxt dev --host 127.0.0.1 --port {port}");
    expect(cfg.commands.api.run).toBe("pnpm --filter api run dev");
    expect([snapshot(dir), snapshot(env.configDir), snapshot(env.stateHome)]).toEqual(before);
    expect(recorded).toEqual([]);
    expect(markers(tmp)).toEqual([]);
  });

  it("needs no config dir", async () => {
    const r = await env.run(["--config-dir", join(tmp, "missing"), "config", "detect", dir]);
    expect(r.code, r.stderr).toBe(0);
    expect(existsSync(join(tmp, "missing"))).toBe(false);
  });

  it("with no argument reads the current directory", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const r = await env.run(["config", "detect", "--repo-file"]);
      expect(r.code, r.stderr).toBe(0);
      expect((parseToml(r.stdout) as any).repo).toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
  });

  it("--json prints the findings, each with a kind, confidence and reason", async () => {
    const r = await env.run(["--json", "config", "detect", dir]);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.source).toEqual({ kind: "path", path: dir });
    expect(out.repoFile).toBe(false);
    expect(out.config.commands.dev.run).toContain("nuxt dev");
    expect(out.findings.length).toBeGreaterThan(5);
    for (const f of out.findings) {
      expect(["detected", "guess", "note"]).toContain(f.kind);
      expect(["high", "medium", "low"]).toContain(f.confidence);
      expect(f.reason).not.toBe("");
      expect(f.kind === "guess").toBe(f.confidence === "low");
      expect(f.key === null).toBe(f.kind === "note");
    }
    expect(out.findings.find((f: any) => f.key === "commands.api.env.PORT")).toMatchObject({ value: "{port+1}", kind: "guess" });
  });

  it("--repo-file --json holds only repo-file keys", async () => {
    const out = JSON.parse((await env.run(["--json", "config", "detect", dir, "--repo-file"])).stdout);
    expect(out.repoFile).toBe(true);
    expect(out.config.repo).toBeUndefined();
    expect(out.findings.some((f: any) => f.key === "repo")).toBe(false);
  });

  it("a missing directory or an unknown project is a usage error", async () => {
    const missing = await env.run(["config", "detect", join(tmp, "nope")]);
    expect(missing.code).toBe(2);
    const unknown = await env.run(["config", "detect", "nope"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("unknown project 'nope'");
    expect(unknown.stderr).toContain("pass ./nope for a directory");
  });

  it("--repo-file and --detect belong to their own verbs", async () => {
    writeFileSync(join(env.configDir, "app.toml"), `repo = "x"\nrepo_path = "${join(tmp, "r")}"\nworktrees_path = "${join(tmp, "t")}"\n`);
    const a = await env.run(["config", "show", "app", "--repo-file"]);
    expect(a.code).toBe(2);
    expect(a.stderr).toContain("unknown flag '--repo-file'");
    const b = await env.run(["config", "detect", dir, "--detect"]);
    expect(b.code).toBe(2);
    expect(b.stderr).toContain("unknown flag '--detect'");
  });

  it("a draft that fails validation exits 1 and prints nothing", async () => {
    setDraftTransform((t) => `${t}[hooks]\nnope = "x"\n`);
    const r = await env.run(["config", "detect", dir]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("E_INTERNAL");
  });

  it("never reads a file the rules name through a symlink", async () => {
    const outside = join(tmp, "outside");
    writeTree(outside, {
      "package.json": JSON.stringify({ name: "evil", packageManager: "pnpm@9.0.0", scripts: { dev: "next dev" } }),
      "pnpm-workspace.yaml": "packages:\n  - evil/*\n",
    });
    const root = join(tmp, "linked");
    writeTree(root, { "pnpm-lock.yaml": "" });
    spawnSync("ln", ["-s", join(outside, "package.json"), join(root, "package.json")]);
    const r = await env.run(["config", "detect", root]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("# note: no package.json at the root; nothing else to detect");
    expect(r.stdout).not.toContain("evil");

    // A real package.json, with the workspace file linked out.
    rmSync(join(root, "package.json"));
    writeTree(root, { "package.json": JSON.stringify({ packageManager: "pnpm@9.0.0" }) });
    spawnSync("ln", ["-s", join(outside, "pnpm-workspace.yaml"), join(root, "pnpm-workspace.yaml")]);
    const w = await env.run(["config", "detect", root]);
    expect(w.code, w.stderr).toBe(0);
    expect(w.stdout).not.toContain("evil");
    expect(w.stdout).not.toContain("pnpm-workspace.yaml");
  });

  it("the local adapter reads nothing through a symlinked directory or file", async () => {
    const outside = join(tmp, "outside");
    writeTree(outside, { "package.json": "{}" });
    const root = join(tmp, "adapter");
    writeTree(root, { "real/package.json": "{}" });
    spawnSync("ln", ["-s", outside, join(root, "linked")]);
    spawnSync("ln", ["-s", join(outside, "package.json"), join(root, "package.json")]);
    const files = localFiles(root);
    expect(await files.read("real/package.json")).toBe("{}");
    expect(await files.read("linked/package.json")).toBeNull();
    expect(await files.read("package.json")).toBeNull();
    expect(await files.read("../outside/package.json")).toBeNull();
    expect(await files.list()).toEqual(["real/package.json"]);
  });

  it("skips node_modules and .git", async () => {
    writeTree(dir, {
      "node_modules/pkg/.env.example": "",
      "node_modules/pkg/package.json": JSON.stringify({ name: "pkg", scripts: { dev: "vite" } }),
      ".git/hooks/.env.example": "",
    });
    const cfg = parseToml((await env.run(["config", "detect", dir])).stdout) as any;
    expect(cfg.setup.seed_files).toEqual(["apps/web/.env"]);
  });

  it("never follows a symlink out of the directory", async () => {
    const outside = join(tmp, "outside");
    writeTree(outside, { "package.json": JSON.stringify({ name: "evil", scripts: { dev: "next dev" } }) });
    rmSync(join(dir, "apps", "web"), { recursive: true });
    spawnSync("ln", ["-s", outside, join(dir, "apps", "web")]);
    recorded = [];
    const r = await env.run(["config", "detect", dir]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).not.toContain("evil");
  });
});

// ── config detect <project> ──────────────────────────────────────────────────

describe("config detect <project>", () => {
  let origin: FixtureOrigin;
  beforeEach(() => {
    origin = makeFixtureOrigin(tmp);
    origin.commit("main", REPO_FILES);
    env = makeEnv(tmp, { app: { repo: origin.url, defaultBranch: "main" } });
  });

  it("reads origin/<default> of the bare repo, with read-only git and no worktree", async () => {
    expect((await env.run(["config", "trust", "app"])).code).toBe(0); // clones; no repo file
    const repoPath = env.repoPath("app");
    const refs = git(repoPath, "for-each-ref");
    const state = snapshot(env.stateHome);
    recorded = [];

    const r = await env.run(["config", "detect", "app"]);
    expect(r.code, r.stderr).toBe(0);
    const cfg = parseToml(r.stdout) as any;
    expect(cfg.repo).toBe(origin.url);
    expect(cfg.commands.dev.run).toBe("pnpm --filter web exec nuxt dev --host 127.0.0.1 --port {port}");
    expect(r.stdout).toContain(`repo = "${origin.url}"  # detected: app.toml`);

    for (const argv of recorded) {
      expect(argv[0]).toBe("git");
      expect(READ_ONLY_GIT.has(gitSubcommand(argv)!), argv.join(" ")).toBe(true);
    }
    expect(git(repoPath, "for-each-ref")).toBe(refs);
    expect(git(repoPath, "worktree", "list").trim().split("\n")).toHaveLength(1);
    expect(existsSync(env.worktreesPath("app"))).toBe(false);
    expect(snapshot(env.stateHome)).toEqual(state);
    expect(markers(tmp)).toEqual([]);
  });

  it("--json names the project and ref", async () => {
    expect((await env.run(["config", "trust", "app"])).code).toBe(0);
    const out = JSON.parse((await env.run(["--json", "config", "detect", "app"])).stdout);
    expect(out.source).toEqual({ kind: "project", project: "app", ref: "origin/main" });
  });

  it("a project that isn't cloned yet exits 3", async () => {
    const r = await env.run(["config", "detect", "app"]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("hint: clone it with `testlane config trust app`");
  });

  it("the git adapter lists regular files and caps a read at 1 MiB", async () => {
    origin.commit("main", { "big.json": "x".repeat(1024 * 1024 + 1) });
    expect((await env.run(["config", "trust", "app"])).code).toBe(0);
    const files = gitFiles(env.repoPath("app"), "refs/remotes/origin/main");
    expect(await files.list()).toContain("apps/web/package.json");
    expect(await files.exists("turbo.json")).toBe(true);
    expect(await files.read("nope")).toBeNull();
    expect(JSON.parse((await files.read("apps/web/package.json"))!).name).toBe("web");
    await expect(files.read("big.json")).rejects.toMatchObject({ errCode: "E_CONFIG" });
  });
});

// ── --detect on config add <url> and setup ──────────────────────────────────

describe("--detect", () => {
  const URL = "https://github.com/acme/app";
  const CLONE = "https://github.com/acme/app.git";
  const TRUSTED = "https://github.com/acme/trusted.git";
  const REPO_TOML = `[commands.dev]\nrun = "true"\n`;
  let plain: FixtureOrigin;
  let withFile: FixtureOrigin;
  const saved: Record<string, string | undefined> = {};
  const setEnv = (key: string, value: string) => {
    if (!(key in saved)) saved[key] = process.env[key];
    process.env[key] = value;
  };

  beforeEach(() => {
    plain = makeFixtureOrigin(join(tmp, "plain"));
    plain.commit("main", REPO_FILES);
    withFile = makeFixtureOrigin(join(tmp, "trusted"));
    withFile.commit("main", { ...REPO_FILES, ".testlane.toml": REPO_TOML });
    setEnv("GIT_CONFIG_COUNT", "3");
    setEnv("GIT_CONFIG_KEY_0", `url.${plain.url}.insteadOf`);
    setEnv("GIT_CONFIG_VALUE_0", CLONE);
    setEnv("GIT_CONFIG_KEY_1", `url.${withFile.url}.insteadOf`);
    setEnv("GIT_CONFIG_VALUE_1", TRUSTED);
    setEnv("GIT_CONFIG_KEY_2", `url.file://${join(tmp, "nowhere.git")}.insteadOf`);
    setEnv("GIT_CONFIG_VALUE_2", "https://github.com/acme/missing.git");
    setEnv("EDITOR", "true");
    env = makeEnv(tmp, {});
    writeFileSync(join(env.configDir, "defaults.toml"), `root = ${JSON.stringify(join(tmp, "root"))}\n`);
    recorded = [];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      delete saved[key];
    }
  });

  const projectFile = (name = "app") => readFileSync(join(env.configDir, `${name}.toml`), "utf8");
  const stateOf = (name: string) => {
    const f = join(env.stateHome, "testlane", `${name}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  };
  const onlyGitAnd = (extra: string[]) => {
    for (const argv of recorded) {
      if (argv[0] === "git") continue;
      expect(extra, argv.join(" ")).toContain(argv[0]);
    }
  };

  it("config add <url> --detect writes the draft and opens the editor", async () => {
    const r = await env.run(["config", "add", URL, "--detect"]);
    expect(r.code, r.stderr).toBe(0);
    const text = projectFile();
    expect(text).toContain(`repo = "${CLONE}"  # detected: config add ${CLONE}`);
    expect(text).toContain(`[commands.dev]\nrun = "pnpm --filter web exec nuxt dev --host 127.0.0.1 --port {port}"`);
    expect((await env.run(["config", "validate", "app"])).code).toBe(0);
    // Only git, and the $EDITOR launch.
    const others = recorded.filter((a) => a[0] !== "git");
    expect(others).toHaveLength(1);
    expect(others[0]!.join(" ")).toContain("true");
    expect(markers(tmp)).toEqual([]);
  });

  it("config add <url> --detect: a .testlane.toml wins and nothing is detected", async () => {
    const r = await env.run(["--yes", "config", "add", "https://github.com/acme/trusted", "--detect"]);
    expect(r.code, r.stderr).toBe(0);
    expect(projectFile("trusted")).toBe(`repo = "${TRUSTED}"\n`);
    expect(stateOf("trusted").repoConfig.content).toBe(REPO_TOML);
    expect(r.stderr).not.toContain("detecting");
  });

  it("config add <url> without --detect still writes the template", async () => {
    expect((await env.run(["config", "add", URL])).code).toBe(0);
    expect(projectFile()).toBe(defaultProjectTemplate("app", CLONE));
  });

  it("config add <url> --detect --dry-run creates nothing and prints the detect step", async () => {
    const r = await env.run(["--dry-run", "config", "add", URL, "--detect"]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain(`detect origin/<default> → ${join(env.configDir, "app.toml")}`);
    expect(existsSync(join(env.configDir, "app.toml"))).toBe(false);
    expect(existsSync(join(tmp, "root"))).toBe(false);
  });

  it("setup --detect clones, writes repo, default_branch and the draft, and opens no editor", async () => {
    setEnv("EDITOR", "false"); // an editor run would fail the command
    const r = await env.run(["setup", "--name", "app", "--repo", CLONE, "--default-branch", "main", "--detect"]);
    expect(r.code, r.stderr).toBe(0);
    const text = projectFile();
    expect(text).toMatch(new RegExp(`^repo = "${CLONE.replace(/[.]/g, "\\.")}"  # detected: setup --repo\\ndefault_branch = "main"  # detected: setup --default-branch\\n`, "m"));
    expect(text).toContain("[commands.dev]");
    expect(r.stderr).toContain("next: testlane config edit app");
    expect((await env.run(["config", "validate", "app"])).code).toBe(0);
    onlyGitAnd([]);
    expect(markers(tmp)).toEqual([]);
  });

  it("setup --detect: a .testlane.toml wins and the file stays repo and default_branch", async () => {
    const r = await env.run(["--yes", "setup", "--name", "app", "--repo", TRUSTED, "--default-branch", "main", "--detect"]);
    expect(r.code, r.stderr).toBe(0);
    expect(projectFile()).toBe(`repo = "${TRUSTED}"\ndefault_branch = "main"\n`);
    expect(stateOf("app").repoConfig.content).toBe(REPO_TOML);
    expect(projectFile()).not.toContain("# detected:");
  });

  it("setup --detect --force reuses the existing clone", async () => {
    expect((await env.run(["setup", "--name", "app", "--repo", CLONE, "--detect"])).code).toBe(0);
    recorded = [];
    const r = await env.run(["setup", "--name", "app", "--repo", CLONE, "--detect", "--force"]);
    expect(r.code, r.stderr).toBe(0);
    expect(recorded.some((a) => a.includes("clone"))).toBe(false);
    expect(projectFile()).toContain("[commands.dev]");
  });

  it("setup --detect --force with another --repo refuses the existing clone and puts the file back", async () => {
    expect((await env.run(["setup", "--name", "app", "--repo", CLONE, "--default-branch", "main", "--detect"])).code).toBe(0);
    const before = projectFile();
    const r = await env.run(["--yes", "setup", "--name", "app", "--repo", TRUSTED, "--default-branch", "main", "--detect", "--force"]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain(`is a clone of ${CLONE}, not ${TRUSTED}`);
    expect(projectFile()).toBe(before);
    expect(stateOf("app")?.repoConfig).toBeUndefined();
  });

  it("setup --detect --dry-run prints the clone and detect steps and creates nothing", async () => {
    const r = await env.run(["--dry-run", "setup", "--name", "app", "--repo", CLONE, "--default-branch", "main", "--detect"]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("git clone --bare --filter=blob:none");
    expect(r.stdout).toContain(`detect origin/main → ${join(env.configDir, "app.toml")}`);
    expect(existsSync(join(env.configDir, "app.toml"))).toBe(false);
    expect(existsSync(join(tmp, "root"))).toBe(false);
  });

  it("setup --detect: a failed clone removes what it wrote and exits 5", async () => {
    const r = await env.run(["setup", "--name", "app", "--repo", "https://github.com/acme/missing.git", "--detect"]);
    expect(r.code).toBe(5);
    expect(existsSync(join(env.configDir, "app.toml"))).toBe(false);
    expect(existsSync(join(tmp, "root", "app", "repo"))).toBe(false);
  });

  it("setup without --detect is unchanged", async () => {
    const r = await env.run(["setup", "--name", "app", "--repo", CLONE]);
    expect(r.code).toBe(0);
    expect(projectFile()).toBe(`repo = "${CLONE}"\n`);
    expect(recorded).toEqual([]);
  });
});
