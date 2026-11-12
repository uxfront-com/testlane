// Compatibility with uxd 1.x (DESIGN.md §5.6), end to end through main().
//
// Each test runs in a throwaway HOME and XDG_STATE_HOME with every config and
// debug variable cleared, so the config dir and state dir resolve the way they
// do on a user's machine, and a real ~/.uxd or ~/.testlane here changes nothing.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, unavailableGh } from "../../src/main.ts";
import { makeFixtureOrigin, type FixtureOrigin } from "../fixtures.ts";

const VARS = ["HOME", "XDG_STATE_HOME", "TESTLANE_CONFIG_DIR", "UXD_CONFIG_DIR", "TESTLANE_DEBUG", "UXD_DEBUG"];

let tmp: string;
let home: string;
let stateHome: string;
let origin: FixtureOrigin;

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "testlane-compat-")));
  home = join(tmp, "home");
  stateHome = join(tmp, "state");
  mkdirSync(home, { recursive: true });
  mkdirSync(stateHome, { recursive: true });
  origin = makeFixtureOrigin(tmp);
  origin.commit("main", { "README.md": "# fixture\n" });
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  warnings: string[];
}

/** Run main() in-process in the throwaway home, with only `env` set. */
async function run(argv: string[], env: Record<string, string> = {}): Promise<RunResult> {
  const saved = new Map(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
  process.env.HOME = home;
  process.env.XDG_STATE_HOME = stateHome;
  Object.assign(process.env, env);

  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await main(argv, { gh: unavailableGh });
    const warnings = err.split("\n").filter((l) => l.startsWith("warning: "));
    return { code, stdout: out, stderr: err, warnings };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Write a project config into `dir`, with its repo and worktrees under tmp. */
function writeProject(dir: string, name: string, extraToml = ""): void {
  mkdirSync(dir, { recursive: true });
  const lines = [
    `repo = ${JSON.stringify(origin.url)}`,
    `repo_path = ${JSON.stringify(join(tmp, "projects", name, "repo"))}`,
    `worktrees_path = ${JSON.stringify(join(tmp, "projects", name, "trees"))}`,
    `default_branch = "main"`,
    extraToml,
  ];
  writeFileSync(join(dir, `${name}.toml`), lines.join("\n") + "\n");
}

const oldConfig = () => join(home, ".uxd");
const newConfig = () => join(home, ".testlane");
const oldState = () => join(stateHome, "uxd");
const newState = () => join(stateHome, "testlane");

function projectNames(stdout: string): string[] {
  return (JSON.parse(stdout) as { name: string }[]).map((p) => p.name);
}

describe("config dir resolution", () => {
  it("reads ~/.uxd when it's the only config dir, and warns once with the fix", async () => {
    writeProject(oldConfig(), "legacy");
    const r = await run(["projects"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("legacy");
    expect(r.stdout).not.toContain("warning");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("~/.uxd");
    expect(r.warnings[0]).toContain("~/.testlane");
    expect(r.warnings[0]).toContain("mv ~/.uxd ~/.testlane");
  });

  it("prefers ~/.testlane when both exist, and warns about nothing", async () => {
    writeProject(oldConfig(), "legacy");
    writeProject(newConfig(), "current");
    const r = await run(["--json", "projects"]);
    expect(r.code).toBe(0);
    expect(projectNames(r.stdout)).toEqual(["current"]);
    expect(r.stderr).toBe("");
  });

  it("uses ~/.testlane with no warning when only it exists", async () => {
    writeProject(newConfig(), "current");
    const r = await run(["--json", "projects"]);
    expect(projectNames(r.stdout)).toEqual(["current"]);
    expect(r.stderr).toBe("");
  });

  it("falls back to ~/.testlane when neither exists, and names it in the error", async () => {
    const r = await run(["projects"]);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain(`config directory does not exist: ${newConfig()}`);
    expect(r.warnings).toHaveLength(0);
  });

  it("keeps --json stdout valid JSON while it warns on stderr", async () => {
    writeProject(oldConfig(), "legacy");
    const r = await run(["--json", "projects"]);
    expect(r.code).toBe(0);
    expect(projectNames(r.stdout)).toEqual(["legacy"]);
    expect(r.warnings).toHaveLength(1);
  });

  it("reads $UXD_CONFIG_DIR when $TESTLANE_CONFIG_DIR is unset, and warns once", async () => {
    const dir = join(tmp, "env-config");
    writeProject(dir, "fromenv");
    writeProject(newConfig(), "current");
    const r = await run(["--json", "projects"], { UXD_CONFIG_DIR: dir });
    expect(projectNames(r.stdout)).toEqual(["fromenv"]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("UXD_CONFIG_DIR");
    expect(r.warnings[0]).toContain("TESTLANE_CONFIG_DIR");
  });

  it("ignores a blank $UXD_CONFIG_DIR", async () => {
    writeProject(newConfig(), "current");
    const r = await run(["--json", "projects"], { UXD_CONFIG_DIR: "  " });
    expect(projectNames(r.stdout)).toEqual(["current"]);
    expect(r.stderr).toBe("");
  });

  it("prefers $TESTLANE_CONFIG_DIR over $UXD_CONFIG_DIR, with no warning", async () => {
    const oldDir = join(tmp, "old-env");
    const newDir = join(tmp, "new-env");
    writeProject(oldDir, "old");
    writeProject(newDir, "new");
    const r = await run(["--json", "projects"], { UXD_CONFIG_DIR: oldDir, TESTLANE_CONFIG_DIR: newDir });
    expect(projectNames(r.stdout)).toEqual(["new"]);
    expect(r.stderr).toBe("");
  });

  it("prefers $UXD_CONFIG_DIR over ~/.testlane and ~/.uxd, as the order says", async () => {
    const dir = join(tmp, "env-config");
    writeProject(dir, "fromenv");
    writeProject(oldConfig(), "legacy");
    const r = await run(["--json", "projects"], { UXD_CONFIG_DIR: dir });
    expect(projectNames(r.stdout)).toEqual(["fromenv"]);
    // Only the variable warns: ~/.uxd was never consulted.
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("UXD_CONFIG_DIR");
  });

  it("prefers --config-dir over every variable and dir, with no warning", async () => {
    const flagDir = join(tmp, "flag-config");
    const envDir = join(tmp, "env-config");
    writeProject(flagDir, "fromflag");
    writeProject(envDir, "fromenv");
    writeProject(oldConfig(), "legacy");
    const r = await run(["--config-dir", flagDir, "--json", "projects"], { UXD_CONFIG_DIR: envDir });
    expect(projectNames(r.stdout)).toEqual(["fromflag"]);
    expect(r.stderr).toBe("");
  });

  it("creates ~/.testlane on setup when neither config dir exists", async () => {
    const r = await run(["setup", "--name", "demo", "--repo", origin.url, "--root", join(tmp, "root")]);
    expect(r.code).toBe(0);
    expect(existsSync(join(newConfig(), "demo.toml"))).toBe(true);
    expect(existsSync(oldConfig())).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it("warns again on the next run, since the dir is still in the old place", async () => {
    writeProject(oldConfig(), "legacy");
    const first = await run(["projects"]);
    const second = await run(["projects"]);
    expect(first.warnings).toHaveLength(1);
    expect(second.warnings).toHaveLength(1);
  });
});

describe("state dir resolution", () => {
  it("uses <state>/uxd when it's the only state dir, and warns once for many reads and writes", async () => {
    writeProject(newConfig(), "app");
    mkdirSync(oldState(), { recursive: true });
    const r = await run(["app", "main", "checkout"]);
    expect(r.code).toBe(0);
    expect(existsSync(join(oldState(), "app.json"))).toBe(true);
    expect(existsSync(newState())).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain(`mv ${oldState()} ${newState()}`);
  });

  it("prefers <state>/testlane when both exist, and warns about nothing", async () => {
    writeProject(newConfig(), "app");
    mkdirSync(oldState(), { recursive: true });
    mkdirSync(newState(), { recursive: true });
    const r = await run(["app", "main", "checkout"]);
    expect(r.code).toBe(0);
    expect(existsSync(join(newState(), "app.json"))).toBe(true);
    expect(existsSync(join(oldState(), "app.json"))).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it("creates <state>/testlane when neither exists", async () => {
    writeProject(newConfig(), "app");
    const r = await run(["app", "main", "checkout"]);
    expect(r.code).toBe(0);
    expect(existsSync(join(newState(), "app.json"))).toBe(true);
    expect(existsSync(oldState())).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it("lists the workspaces of the old layout, with one warning per old dir", async () => {
    writeProject(oldConfig(), "app");
    mkdirSync(oldState(), { recursive: true });
    expect((await run(["app", "main", "checkout"])).code).toBe(0);

    const r = await run(["app", "list", "--json"]);
    expect(r.code).toBe(0);
    const rows = JSON.parse(r.stdout) as { slug: string }[];
    expect(rows.map((w) => w.slug)).toEqual(["main"]);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings.filter((w) => w.includes("config dir"))).toHaveLength(1);
    expect(r.warnings.filter((w) => w.includes("state dir"))).toHaveLength(1);
  });
});

describe("debug output", () => {
  // `config validate` on an unknown project fails, so a debug run prints the stack.
  const failing = ["config", "validate", "nope"];

  it("turns on with $UXD_DEBUG=1 and warns once", async () => {
    writeProject(newConfig(), "app");
    const r = await run(failing, { UXD_DEBUG: "1" });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/\n\s+at /);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("UXD_DEBUG");
    expect(r.warnings[0]).toContain("TESTLANE_DEBUG=1");
  });

  it("turns on with $TESTLANE_DEBUG=1 and no warning", async () => {
    writeProject(newConfig(), "app");
    const r = await run(failing, { TESTLANE_DEBUG: "1", UXD_DEBUG: "1" });
    expect(r.stderr).toMatch(/\n\s+at /);
    expect(r.warnings).toHaveLength(0);
  });

  it("stays off when $TESTLANE_DEBUG is set to anything else, whatever $UXD_DEBUG says", async () => {
    writeProject(newConfig(), "app");
    const r = await run(failing, { TESTLANE_DEBUG: "0", UXD_DEBUG: "1" });
    expect(r.code).not.toBe(0);
    expect(r.stderr).not.toMatch(/\n\s+at /);
    expect(r.warnings).toHaveLength(0);
  });

  it("stays off when neither is set", async () => {
    writeProject(newConfig(), "app");
    const r = await run(failing);
    expect(r.stderr).not.toMatch(/\n\s+at /);
    expect(r.warnings).toHaveLength(0);
  });
});

describe("exported variables", () => {
  const exportsOf = (stdout: string): Map<string, string> => {
    const out = new Map<string, string>();
    for (const line of stdout.split("\n")) {
      const m = /^export ([A-Z_0-9]+)=(.*)$/.exec(line);
      if (m) out.set(m[1]!, m[2]!.replace(/^'(.*)'$/, "$1"));
    }
    return out;
  };

  it("exports every TESTLANE_* variable under its UXD_* name too", async () => {
    writeProject(newConfig(), "app", ["ports = 2", "[commands.dump]", 'run = "env"'].join("\n"));
    const r = await run(["--dry-run", "app", "main", "run", "dump"]);
    expect(r.code).toBe(0);
    const env = exportsOf(r.stdout);
    const names = ["PATH", "REPO_PATH", "DATA_DIR", "PROJECT", "REF", "BRANCH", "SLUG", "PORT", "PORT_1"];
    for (const name of names) {
      expect(env.get(`TESTLANE_${name}`), name).toBeDefined();
      expect(env.get(`UXD_${name}`), name).toBe(env.get(`TESTLANE_${name}`));
    }
    expect(env.get("TESTLANE_PORT")).not.toBe("");
    expect(r.warnings).toHaveLength(0);
  });

  it("lets [env], command env and --env override both names", async () => {
    writeProject(
      newConfig(),
      "app",
      [
        "ports = 1",
        "[env]",
        'UXD_SLUG = "project"',
        'TESTLANE_SLUG = "project"',
        "[commands.dump]",
        'run = "env"',
        "[commands.dump.env]",
        'UXD_REF = "command"',
      ].join("\n"),
    );
    const r = await run(["--dry-run", "app", "main", "run", "dump", "--env", "UXD_PORT=flag"]);
    const env = exportsOf(r.stdout);
    expect(env.get("UXD_SLUG")).toBe("project");
    expect(env.get("TESTLANE_SLUG")).toBe("project");
    expect(env.get("UXD_REF")).toBe("command");
    expect(env.get("TESTLANE_REF")).toBe("main");
    expect(env.get("UXD_PORT")).toBe("flag");
    expect(env.get("TESTLANE_PORT")).not.toBe("flag");
  });

  it("hands both names to the command it runs, under [env]", async () => {
    writeProject(
      newConfig(),
      "app",
      ["ports = 1", "[env]", 'UXD_SLUG = "project"', "[commands.dump]", 'run = "env > env.txt"'].join("\n"),
    );
    const r = await run(["app", "main", "run", "dump"]);
    expect(r.code).toBe(0);
    const ws = join(tmp, "projects", "app", "trees", "main");
    const dumped = readFileSync(join(ws, "env.txt"), "utf8");
    const port = /^TESTLANE_PORT=(\d+)$/m.exec(dumped)?.[1];
    expect(port).toBeDefined();
    expect(dumped).toMatch(new RegExp(`^UXD_PORT=${port}$`, "m"));
    expect(dumped).toMatch(new RegExp(`^UXD_PATH=${ws}$`, "m"));
    // [env] still wins over the twin it names, and leaves the other name alone.
    expect(dumped).toMatch(/^UXD_SLUG=project$/m);
    expect(dumped).toMatch(/^TESTLANE_SLUG=main$/m);
  });
});
