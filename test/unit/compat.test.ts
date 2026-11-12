// Compatibility with uxd 1.x (DESIGN.md §5.6): the fallbacks one by one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  legacyConfigDir,
  legacyConfigDirFromEnv,
  legacyDebugFromEnv,
  legacyEnvAliases,
  legacyStateDir,
  preferCurrentDir,
  resetCompatWarnings,
} from "../../src/lib/compat.ts";
import { defaultConfigDir, stateDir } from "../../src/lib/paths.ts";
import { exportedEnv, testlaneEnv, type WorkspaceContext } from "../../src/core/env.ts";

const VARS = ["HOME", "XDG_STATE_HOME", "UXD_CONFIG_DIR", "UXD_DEBUG"];

let tmp: string;
let saved: Map<string, string | undefined>;
let stderr: string[];
let stdout: string[];

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "testlane-compat-unit-")));
  saved = new Map(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
  process.env.HOME = join(tmp, "home");
  process.env.XDG_STATE_HOME = join(tmp, "state");
  mkdirSync(process.env.HOME, { recursive: true });
  resetCompatWarnings();
  stderr = [];
  stdout = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tmp, { recursive: true, force: true });
});

const home = () => process.env.HOME!;

describe("preferCurrentDir", () => {
  const current = () => join(home(), ".testlane");
  const legacy = () => join(home(), ".uxd");

  it("returns the current dir, silently, when only it exists", () => {
    mkdirSync(current());
    expect(preferCurrentDir(current(), legacy(), "config dir")).toBe(current());
    expect(stderr).toEqual([]);
  });

  it("returns the current dir, silently, when both exist", () => {
    mkdirSync(current());
    mkdirSync(legacy());
    expect(preferCurrentDir(current(), legacy(), "config dir")).toBe(current());
    expect(stderr).toEqual([]);
  });

  it("returns the current dir, silently, when neither exists", () => {
    expect(preferCurrentDir(current(), legacy(), "config dir")).toBe(current());
    expect(stderr).toEqual([]);
  });

  it("returns the legacy dir when only it exists, with one warning line on stderr", () => {
    mkdirSync(legacy());
    expect(preferCurrentDir(current(), legacy(), "config dir")).toBe(legacy());
    expect(stderr).toEqual([
      "warning: using ~/.uxd, the config dir of uxd. Testlane 3.0 reads only ~/.testlane. Move it: mv ~/.uxd ~/.testlane\n",
    ]);
    expect(stdout).toEqual([]);
  });

  it("warns once however often it's asked, until the warnings are reset", () => {
    mkdirSync(legacy());
    preferCurrentDir(current(), legacy(), "config dir");
    preferCurrentDir(current(), legacy(), "config dir");
    expect(stderr).toHaveLength(1);
    resetCompatWarnings();
    preferCurrentDir(current(), legacy(), "config dir");
    expect(stderr).toHaveLength(2);
  });

  it("writes paths outside the home directory in full", () => {
    const out = join(tmp, "elsewhere");
    mkdirSync(join(out, "uxd"), { recursive: true });
    preferCurrentDir(join(out, "testlane"), join(out, "uxd"), "state dir");
    expect(stderr[0]).toContain(`mv ${join(out, "uxd")} ${join(out, "testlane")}`);
  });
});

describe("defaultConfigDir", () => {
  it("is ~/.testlane when it exists, or when no config dir exists", () => {
    expect(defaultConfigDir()).toBe(join(home(), ".testlane"));
    mkdirSync(join(home(), ".testlane"));
    mkdirSync(join(home(), ".uxd"));
    expect(defaultConfigDir()).toBe(join(home(), ".testlane"));
    expect(stderr).toEqual([]);
  });

  it("is ~/.uxd, with a warning, when only it exists", () => {
    mkdirSync(join(home(), ".uxd"));
    expect(defaultConfigDir()).toBe(legacyConfigDir());
    expect(legacyConfigDir()).toBe(join(home(), ".uxd"));
    expect(stderr).toHaveLength(1);
  });
});

describe("stateDir", () => {
  const state = () => process.env.XDG_STATE_HOME!;

  it("is <state>/testlane when it exists, or when no state dir exists", () => {
    expect(stateDir()).toBe(join(state(), "testlane"));
    mkdirSync(join(state(), "testlane"), { recursive: true });
    mkdirSync(join(state(), "uxd"), { recursive: true });
    expect(stateDir()).toBe(join(state(), "testlane"));
    expect(stderr).toEqual([]);
  });

  it("is <state>/uxd, with one warning, when only it exists", () => {
    mkdirSync(join(state(), "uxd"), { recursive: true });
    expect(stateDir()).toBe(legacyStateDir(state()));
    expect(stateDir()).toBe(join(state(), "uxd"));
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("state dir");
  });

  it("follows XDG_STATE_HOME, and ~/.local/state without it", () => {
    delete process.env.XDG_STATE_HOME;
    expect(stateDir()).toBe(join(home(), ".local", "state", "testlane"));
  });
});

describe("legacyConfigDirFromEnv", () => {
  it("is undefined, silently, when UXD_CONFIG_DIR is unset or blank", () => {
    expect(legacyConfigDirFromEnv()).toBeUndefined();
    process.env.UXD_CONFIG_DIR = " ";
    expect(legacyConfigDirFromEnv()).toBeUndefined();
    expect(stderr).toEqual([]);
  });

  it("returns UXD_CONFIG_DIR and warns once with the variable to set", () => {
    process.env.UXD_CONFIG_DIR = "/some/dir";
    expect(legacyConfigDirFromEnv()).toBe("/some/dir");
    expect(legacyConfigDirFromEnv()).toBe("/some/dir");
    expect(stderr).toEqual([
      "warning: using UXD_CONFIG_DIR, the variable of uxd. Testlane 3.0 reads only TESTLANE_CONFIG_DIR. Rename it to TESTLANE_CONFIG_DIR\n",
    ]);
  });
});

describe("legacyDebugFromEnv", () => {
  it("is false, silently, unless UXD_DEBUG is exactly 1", () => {
    expect(legacyDebugFromEnv()).toBe(false);
    process.env.UXD_DEBUG = "true";
    expect(legacyDebugFromEnv()).toBe(false);
    process.env.UXD_DEBUG = "0";
    expect(legacyDebugFromEnv()).toBe(false);
    expect(stderr).toEqual([]);
  });

  it("is true with UXD_DEBUG=1, and warns once", () => {
    process.env.UXD_DEBUG = "1";
    expect(legacyDebugFromEnv()).toBe(true);
    expect(legacyDebugFromEnv()).toBe(true);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("TESTLANE_DEBUG=1");
  });
});

describe("legacyEnvAliases", () => {
  it("renames each TESTLANE_* key to UXD_* and drops every other key", () => {
    expect(
      legacyEnvAliases({ TESTLANE_PORT: "3000", TESTLANE_PORT_1: "3001", PATH: "/bin", MY_TESTLANE_X: "y" }),
    ).toEqual({ UXD_PORT: "3000", UXD_PORT_1: "3001" });
  });

  it("returns nothing for an empty set", () => {
    expect(legacyEnvAliases({})).toEqual({});
  });
});

describe("exportedEnv", () => {
  const wc: WorkspaceContext = {
    path: "/w/app/pr-1",
    repoPath: "/w/app/repo",
    dataDir: "/w/app/data/pr-1",
    project: "app",
    ref: "pr/1",
    branch: "pr/1",
    slug: "pr-1",
    ports: [4100, 4101, 4102],
  };

  it("holds every TESTLANE_* variable and its UXD_* twin with the same value", () => {
    const current = testlaneEnv(wc);
    const all = exportedEnv(wc);
    expect(Object.keys(current)).toEqual([
      "TESTLANE_PATH",
      "TESTLANE_REPO_PATH",
      "TESTLANE_DATA_DIR",
      "TESTLANE_PROJECT",
      "TESTLANE_REF",
      "TESTLANE_BRANCH",
      "TESTLANE_SLUG",
      "TESTLANE_PORT",
      "TESTLANE_PORT_1",
      "TESTLANE_PORT_2",
    ]);
    for (const [key, value] of Object.entries(current)) {
      expect(all[key]).toBe(value);
      expect(all[key.replace("TESTLANE_", "UXD_")]).toBe(value);
    }
    expect(Object.keys(all)).toHaveLength(2 * Object.keys(current).length);
  });

  it("exports an empty port pair when the project allocates no port", () => {
    const all = exportedEnv({ ...wc, ports: [] });
    expect(all.TESTLANE_PORT).toBe("");
    expect(all.UXD_PORT).toBe("");
    expect(all.UXD_PORT_1).toBeUndefined();
  });
});
