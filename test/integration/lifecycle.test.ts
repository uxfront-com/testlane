// start / stop / logs / ps (§9.14–9.17): one detached process per workspace.
// Each test name starts with its acceptance-criterion ID, so `-t "P1-C2"` picks
// them. Every process a test starts is killed in afterEach.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { makeEnv, makeFixtureOrigin, type Harness } from "../fixtures.ts";
import { setProcRecorder } from "../../src/lib/proc.ts";
import { pidAlive } from "../../src/core/state.ts";
import { stopGroup } from "../../src/core/supervise.ts";

const PROJECT = "life";

// A server on $TESTLANE_PORT that logs one line once it listens.
const SERVER =
  `node -e "require('http').createServer((q,s)=>s.end('ok'))` +
  `.listen(process.env.TESTLANE_PORT,'127.0.0.1',()=>console.log('listening on '+process.env.TESTLANE_PORT))"`;

let tmp: string;
let origin: ReturnType<typeof makeFixtureOrigin>;
let env: Harness;
/** PIDs (and so process groups) a test started; killed in afterEach. */
let started: number[];

function makeLifeEnv(extraToml = ""): Harness {
  const toml = [
    `[setup]`,
    `run = ${JSON.stringify(`echo setup >> ${join(tmp, "setup.count")}`)}`,
    `[hooks]`,
    `pre_run = ${JSON.stringify(`echo pre_run >> ${join(tmp, "pre_run.count")}`)}`,
    extraToml,
    `[commands.web]`,
    `run = ${JSON.stringify(SERVER)}`,
    `[commands.api]`,
    `run = ${JSON.stringify(SERVER)}`,
    `[commands.crash]`,
    `run = "echo boom; exit 1"`,
    `[commands.silent]`,
    `run = ${JSON.stringify(`echo $$ > ${join(tmp, "silent.pid")}; exec node -e "setInterval(()=>0,1000)"`)}`,
    `[commands.tree]`,
    // bash stays the group leader and forks the server as its child.
    `run = ${JSON.stringify(`${SERVER.replace("()=>console.log(", "()=>require('fs').writeFileSync(process.env.CHILD_PID_FILE,String(process.pid))||console.log(")} & wait`)}`,
    `env = { CHILD_PID_FILE = ${JSON.stringify(join(tmp, "child.pid"))} }`,
  ].join("\n");
  return makeEnv(tmp, { [PROJECT]: { repo: origin.url, defaultBranch: "main", extraToml: toml } });
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "testlane-life-")));
  origin = makeFixtureOrigin(tmp);
  origin.commit("main", { "README.md": "# fixture\n" });
  origin.commit("feature-x", { "feat.txt": "hello\n" });
  env = makeLifeEnv();
  started = [];
});

afterEach(() => {
  setProcRecorder(null);
  // Also whatever a start recorded, so a failed assertion can't leak a server.
  const data = join(env.worktreesPath(PROJECT), ".data");
  if (existsSync(data)) {
    for (const slug of readdirSync(data)) {
      const file = join(data, slug, "process.json");
      if (existsSync(file)) started.push(Number(JSON.parse(readFileSync(file, "utf8")).pid));
    }
  }
  for (const pid of started) {
    if (!Number.isInteger(pid) || pid <= 1) continue;
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
});

const dataDir = (slug: string) => join(env.worktreesPath(PROJECT), ".data", slug);
const lines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Started {
  project: string;
  slug: string;
  command: string;
  pid: number;
  port: number;
  url: string;
  log: string;
  startedAt: string;
  reused: boolean;
}

async function startJson(args: string[]): Promise<Started> {
  const r = await env.run([PROJECT, ...args, "--json"]);
  expect(r.code, r.stderr).toBe(0);
  const out = JSON.parse(r.stdout) as Started;
  started.push(out.pid);
  return out;
}

function httpGet(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    get({ host: "127.0.0.1", port, path: "/" }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

function psField(field: string, pid: number): string {
  return spawnSync("ps", ["-o", `${field}=`, "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
}

/** Wait until `pid` no longer answers kill(pid, 0); zombies are reaped by Node. */
async function waitDead(pid: number, ms = 5_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (pidAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await sleep(50);
  }
  return true;
}

/** A PID that has exited and been reaped. */
function deadPid(): number {
  const r = spawnSync("bash", ["-c", "echo $$"], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

// ── The built CLI, for runs that need separate testlane processes ────────────────

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
// Built apart from dist/ so it never races packaging.test.ts's build.
const builtDir = join(repoRoot, "node_modules", ".cache", "testlane-lifecycle-build");
const builtCli = join(builtDir, "bin", "testlane.js");

beforeAll(() => {
  const build = spawnSync("npx", ["tsc", "-p", "tsconfig.build.json", "--outDir", builtDir], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}${build.stderr}`);
  // Package-scope lookup stops at node_modules, so the root "type": "module"
  // doesn't reach this build. Without this, Node 18 loads it as CommonJS.
  writeFileSync(join(builtDir, "package.json"), '{"type":"module"}\n');
}, 120_000);

function spawnBuilt(argv: string[]) {
  const child = spawn("node", [builtCli, ...argv], {
    env: { ...process.env, TESTLANE_CONFIG_DIR: env.configDir, XDG_STATE_HOME: env.stateHome, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => (stdout += c));
  child.stderr.on("data", (c) => (stderr += c));
  const done = new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    child.on("close", (code, signal) => resolve({ code: code ?? (signal ? 128 : 1), stdout, stderr }));
  });
  return { child, done, out: () => stdout };
}

// ── P1-C1 ────────────────────────────────────────────────────────────────────

describe("start", () => {
  it("P1-C1 — runs the command detached, returns once the port accepts, and logs its output", async () => {
    const s = await startJson(["main", "start", "web"]);
    for (const key of ["project", "slug", "command", "pid", "port", "log", "startedAt", "reused"]) {
      expect(s).toHaveProperty(key);
    }
    expect(s).toMatchObject({ project: PROJECT, slug: "main", command: "web", reused: false });
    expect(s.log).toBe(join(dataDir("main"), "process.log"));

    // main() has returned and the process still runs, in its own group and session.
    expect(pidAlive(s.pid)).toBe(true);
    expect(Number(psField("pgid", s.pid))).toBe(s.pid);
    expect(await httpGet(s.port)).toBe("ok");
    expect(readFileSync(s.log, "utf8")).toContain(`listening on ${s.port}`);

    const entry = JSON.parse(readFileSync(join(dataDir("main"), "process.json"), "utf8"));
    expect(entry).toMatchObject({ pid: s.pid, command: "web", port: s.port, log: s.log });
    expect(entry.lstart).toBe(psField("lstart", s.pid));
  });

  it("P1-C1 — with --json, stdout is one JSON object even when setup and hooks print", async () => {
    env = makeLifeEnv(`post_checkout = "echo POST-CHECKOUT-OUT"\npre_clean = "true"`);
    const cfg = join(env.configDir, `${PROJECT}.toml`);
    writeFileSync(
      cfg,
      readFileSync(cfg, "utf8")
        .replace(/^run = "echo setup >> .*"$/m, 'run = "echo SETUP-OUT"')
        .replace(/^pre_run = .*$/m, 'pre_run = "echo PRE-RUN-OUT"'),
    );
    // A separate process: children write to fd 1, which the in-process harness can't see.
    const r = await spawnBuilt([PROJECT, "main", "start", "web", "--json"]).done;
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as Started;
    started.push(out.pid);
    expect(out.command).toBe("web");
    for (const line of ["SETUP-OUT", "PRE-RUN-OUT", "POST-CHECKOUT-OUT"]) {
      expect(r.stdout).not.toContain(line);
      expect(r.stderr).toContain(line);
    }
  }, 60_000);

  it("P1-C1 — without --json, prints the URL on stdout", async () => {
    const r = await env.run([PROJECT, "main", "start", "web"]);
    expect(r.code, r.stderr).toBe(0);
    const entry = JSON.parse(readFileSync(join(dataDir("main"), "process.json"), "utf8"));
    started.push(entry.pid);
    expect(r.stdout).toBe(`http://127.0.0.1:${entry.port}\n`);
  });

  // ── P1-C2 ──────────────────────────────────────────────────────────────────

  it("P1-C2 — a second start of the same command reuses the live process and runs nothing", async () => {
    const a = await startJson(["main", "start", "web"]);
    const b = await startJson(["main", "start", "web"]);
    expect(b.reused).toBe(true);
    expect(b.pid).toBe(a.pid);
    expect(b.startedAt).toBe(a.startedAt);
    // setup and pre_run each ran for the first start only.
    expect(lines(join(tmp, "setup.count"))).toHaveLength(1);
    expect(lines(join(tmp, "pre_run.count"))).toHaveLength(1);
  });

  it("P1-C2 — a different live command exits 2 and names it and the stop command", async () => {
    const a = await startJson(["main", "start", "web"]);
    const r = await env.run([PROJECT, "main", "start", "api"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("'web' is already running");
    expect(r.stderr).toContain(`testlane ${PROJECT} main stop`);
    expect(pidAlive(a.pid)).toBe(true);
    expect(lines(join(tmp, "pre_run.count"))).toHaveLength(1);
  });

  it("P1-C2 — two concurrent starts leave one process and both print its PID", async () => {
    // Materialize first so both runs race on start, not on the first clone.
    expect((await env.run([PROJECT, "main", "checkout"])).code).toBe(0);
    const a = spawnBuilt([PROJECT, "main", "start", "web", "--json"]);
    const b = spawnBuilt([PROJECT, "main", "start", "web", "--json"]);
    const [ra, rb] = await Promise.all([a.done, b.done]);
    expect(ra.code, ra.stderr).toBe(0);
    expect(rb.code, rb.stderr).toBe(0);
    const ja = JSON.parse(ra.stdout) as Started;
    const jb = JSON.parse(rb.stdout) as Started;
    started.push(ja.pid, jb.pid);
    expect(ja.pid).toBe(jb.pid);
    expect([ja.reused, jb.reused].sort()).toEqual([false, true]);
    expect(lines(join(tmp, "pre_run.count"))).toHaveLength(1);
  }, 60_000);

  it("P1-C2 — a waiting start gives up on the start lock after its own --timeout", async () => {
    expect((await env.run([PROJECT, "main", "checkout"])).code).toBe(0);
    // A live holder (this process) that never releases.
    writeFileSync(join(dataDir("main"), "start.lock"), JSON.stringify({ pid: process.pid, startedAt: "x" }));
    const t0 = Date.now();
    const r = await env.run([PROJECT, "main", "start", "web", "--timeout", "1"]);
    expect(r.code).toBe(5);
    expect(r.stderr).toContain("timed out waiting for another start");
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(existsSync(join(dataDir("main"), "process.json"))).toBe(false);
  });

  it("P1-C2 — an entry whose process died is replaced by a new start", async () => {
    const a = await startJson(["main", "start", "web"]);
    process.kill(-a.pid, "SIGKILL");
    expect(await waitDead(a.pid)).toBe(true);
    const b = await startJson(["main", "start", "web"]);
    expect(b.reused).toBe(false);
    expect(b.pid).not.toBe(a.pid);
  });

  // ── P1-C3 ──────────────────────────────────────────────────────────────────

  it("P1-C3 — a child that exits before the port is ready gives exit 6 and the log tail", async () => {
    const r = await env.run([PROJECT, "main", "start", "crash"]);
    expect(r.code).toBe(6);
    expect(r.stderr).toContain("exited before 127.0.0.1:");
    expect(r.stderr).toContain("boom");
    expect(existsSync(join(dataDir("main"), "process.json"))).toBe(false);
  });

  it("P1-C3 — a port not ready within --timeout kills the group and exits 6 with a bind hint", async () => {
    const t0 = Date.now();
    const r = await env.run([PROJECT, "main", "start", "silent", "--timeout", "2"]);
    expect(r.code).toBe(6);
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(r.stderr).toContain("within 2s");
    expect(r.stderr).toMatch(/hint: bind the server to 127\.0\.0\.1/);
    const pid = Number(readFileSync(join(tmp, "silent.pid"), "utf8").trim());
    started.push(pid);
    expect(await waitDead(pid)).toBe(true);
    expect(existsSync(join(dataDir("main"), "process.json"))).toBe(false);
  });

  it("P1-C3 — --timeout must be a positive number of seconds", async () => {
    for (const bad of ["0", "-1", "abc", ""]) {
      const r = await env.run([PROJECT, "main", "start", "web", "--timeout", bad]);
      expect(r.code).toBe(2);
    }
  });

  it("P1-C3 — a port someone else already serves is refused instead of reported ready", async () => {
    const co = await env.run([PROJECT, "main", "checkout", "--json"]);
    expect(co.code).toBe(0);
    const port = (JSON.parse(co.stdout) as { ports: number[] }).ports[0]!;
    const squatter = spawn("node", ["-e", `require('net').createServer().listen(${port},'127.0.0.1')`], {
      stdio: "ignore",
    });
    started.push(squatter.pid!);
    for (let i = 0; i < 50 && spawnSync("bash", ["-c", `exec 3<>/dev/tcp/127.0.0.1/${port}`]).status !== 0; i++) {
      await sleep(100);
    }
    const r = await env.run([PROJECT, "main", "start", "web"]);
    expect(r.code).toBe(6);
    expect(r.stderr).toContain(`port ${port} already accepts connections`);
    expect(existsSync(join(dataDir("main"), "process.json"))).toBe(false);
  });

  // ── P1-C8 ──────────────────────────────────────────────────────────────────

  it("P1-C8 — start --port is a usage error", async () => {
    const r = await env.run([PROJECT, "main", "start", "web", "--port", "1"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("start does not take --port");
  });

  it("P1-C8 — --dry-run prints the env and command and spawns nothing", async () => {
    const r = await env.run([PROJECT, "--dry-run", "main", "start", "web"]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^export TESTLANE_PORT=\d+$/m);
    expect(r.stdout).toContain("bash -c");
    expect(r.stdout).toContain("createServer");
    expect(existsSync(join(dataDir("main"), "process.json"))).toBe(false);
    expect(lines(join(tmp, "pre_run.count"))).toHaveLength(0);
  });

  it("P1-C3 — a start whose ref doesn't resolve leaves no data dir behind", async () => {
    const r = await env.run([PROJECT, "no-such-branch", "start", "web"]);
    expect(r.code).not.toBe(0);
    expect(existsSync(dataDir("no-such-branch"))).toBe(false);
  });

  it("P1-C8 — unknown or missing command names are usage errors", async () => {
    expect((await env.run([PROJECT, "main", "start"])).code).toBe(2);
    const r = await env.run([PROJECT, "main", "start", "nope"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("configured commands: web, api");
  });
});

// ── P1-C4 ────────────────────────────────────────────────────────────────────

describe("stop", () => {
  it("P1-C4 — stops the whole group, a child of bash -c included, and clears the entry", async () => {
    const s = await startJson(["main", "start", "tree"]);
    // The port can accept before the listen callback has written the file.
    const pidFile = join(tmp, "child.pid");
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await sleep(50);
    const child = Number(readFileSync(pidFile, "utf8").trim());
    started.push(child);
    expect(child).not.toBe(s.pid);
    expect(Number(psField("pgid", child))).toBe(s.pid);

    const r = await env.run([PROJECT, "main", "stop"]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toContain("tree stopped");
    expect(await waitDead(s.pid)).toBe(true);
    expect(await waitDead(child)).toBe(true);
    expect(existsSync(join(dataDir("main"), "process.json"))).toBe(false);
    // The log is kept.
    expect(existsSync(s.log)).toBe(true);
  });

  it("P1-C4 — a dead recorded PID is not signalled; the entry is cleared and stop exits 0", async () => {
    expect((await env.run([PROJECT, "main", "checkout"])).code).toBe(0);
    const pid = deadPid();
    const file = join(dataDir("main"), "process.json");
    writeFileSync(file, JSON.stringify({ pid, lstart: "x", command: "web", port: 1, log: "l", startedAt: "t" }));
    const r = await env.run([PROJECT, "main", "stop"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("had already exited");
    expect(existsSync(file)).toBe(false);
  });

  it("P1-C4 — a live PID with a different start time is not signalled", async () => {
    expect((await env.run([PROJECT, "main", "checkout"])).code).toBe(0);
    const other = spawn("sleep", ["30"], { stdio: "ignore" });
    started.push(other.pid!);
    const file = join(dataDir("main"), "process.json");
    writeFileSync(
      file,
      JSON.stringify({ pid: other.pid, lstart: "Thu Jan  1 00:00:00 1970", command: "web", port: 1, log: "l", startedAt: "t" }),
    );
    const r = await env.run([PROJECT, "main", "stop"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("had already exited");
    await sleep(200);
    expect(pidAlive(other.pid!)).toBe(true);
    expect(other.exitCode).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it("P1-C4 — an entry naming PID 1 is never signalled", async () => {
    expect((await env.run([PROJECT, "main", "checkout"])).code).toBe(0);
    const file = join(dataDir("main"), "process.json");
    const lstart = psField("lstart", 1);
    writeFileSync(file, JSON.stringify({ pid: 1, lstart, command: "web", port: 1, log: "l", startedAt: "t" }));
    const r = await env.run([PROJECT, "main", "stop"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("not running");
    expect(existsSync(file)).toBe(false);
  });

  it("P1-C4 — with no entry, prints not running and exits 0", async () => {
    const r = await env.run([PROJECT, "main", "stop"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("not running");
  });

  it("P1-C4 — a group that ignores SIGTERM is SIGKILLed after the grace period", async () => {
    const child = spawn("bash", ["-c", "trap '' TERM; while :; do sleep 0.1; done"], {
      detached: true,
      stdio: "ignore",
    });
    started.push(child.pid!);
    await sleep(200);
    expect(await stopGroup(child.pid!, 500)).toBe("killed");
    expect(await waitDead(child.pid!)).toBe(true);
  });
});

// ── P1-C5 ────────────────────────────────────────────────────────────────────

describe("ps", () => {
  it("P1-C5 — lists running and exited entries with their status", async () => {
    const s = await startJson(["main", "start", "web"]);
    expect((await env.run([PROJECT, "feature-x", "checkout"])).code).toBe(0);
    writeFileSync(
      join(dataDir("feature-x"), "process.json"),
      JSON.stringify({ pid: deadPid(), lstart: "x", command: "api", port: 2, log: "/l", startedAt: "2026-01-01T00:00:00Z" }),
    );

    const r = await env.run([PROJECT, "ps", "--json"]);
    expect(r.code, r.stderr).toBe(0);
    const rows = JSON.parse(r.stdout) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.find((x) => x.slug === "main")).toEqual({
      slug: "main",
      command: "web",
      pid: s.pid,
      port: s.port,
      status: "running",
      startedAt: s.startedAt,
      log: s.log,
    });
    expect(rows.find((x) => x.slug === "feature-x")).toMatchObject({ command: "api", status: "exited" });

    const table = await env.run([PROJECT, "ps"]);
    expect(table.code).toBe(0);
    expect(table.stdout).toMatch(/^SLUG\s+COMMAND\s+PID\s+PORT\s+STATUS\s+STARTED\s+LOG$/m);
    expect(table.stdout).toMatch(new RegExp(`^main\\s+web\\s+${s.pid}\\s+${s.port}\\s+running`, "m"));
  });

  it("P1-C5 — with no entries, --json prints an empty array", async () => {
    const r = await env.run([PROJECT, "ps", "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });
});

// ── P1-C6 ────────────────────────────────────────────────────────────────────

describe("logs", () => {
  it("P1-C6 — prints the log file", async () => {
    const s = await startJson(["main", "start", "web"]);
    const r = await env.run([PROJECT, "main", "logs"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`listening on ${s.port}`);
  });

  it("P1-C6 — -f prints a line written after it started, until interrupted", async () => {
    mkdirSync(dataDir("main"), { recursive: true });
    const log = join(dataDir("main"), "process.log");
    writeFileSync(log, "first\n");
    const f = spawnBuilt([PROJECT, "main", "logs", "-f"]);
    for (let i = 0; i < 100 && !f.out().includes("first"); i++) await sleep(50);
    appendFileSync(log, "second\n");
    for (let i = 0; i < 100 && !f.out().includes("second"); i++) await sleep(50);
    f.child.kill("SIGINT");
    const r = await f.done;
    expect(r.stdout).toBe("first\nsecond\n");
    expect(r.code).toBe(0);
  });

  it("P1-C6 — with no log, exits 2 with a message", async () => {
    const r = await env.run([PROJECT, "main", "logs"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`no log for ${PROJECT}/main`);
  });
});

// ── P1-C7 ────────────────────────────────────────────────────────────────────

describe("rm and clean", () => {
  it("P1-C7 — rm stops a live process before it removes the workspace", async () => {
    const s = await startJson(["main", "start", "web"]);
    const r = await env.run([PROJECT, "main", "rm", "--yes"]);
    expect(r.code, r.stderr).toBe(0);
    expect(await waitDead(s.pid)).toBe(true);
    expect(existsSync(dataDir("main"))).toBe(false);
  });

  it("P1-C7 — clean --all stops it too", async () => {
    const s = await startJson(["feature-x", "start", "web"]);
    const r = await env.run([PROJECT, "clean", "--all", "--yes"]);
    expect(r.code, r.stderr).toBe(0);
    expect(await waitDead(s.pid)).toBe(true);
    expect(existsSync(dataDir("feature-x"))).toBe(false);
  });

  it("P1-C7 — a vetoing pre_clean leaves the process and its data dir", async () => {
    env = makeLifeEnv(`pre_clean = "exit 1"`);
    const s = await startJson(["main", "start", "web"]);
    const r = await env.run([PROJECT, "main", "rm", "--yes"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("pre_clean hook failed");
    expect(pidAlive(s.pid)).toBe(true);
    expect(existsSync(join(dataDir("main"), "process.json"))).toBe(true);
  });
});

// ── P1-C9 ────────────────────────────────────────────────────────────────────

describe("doctor", () => {
  it("P1-C9 — warns that a configured command named start, stop or logs is shadowed", async () => {
    env = makeLifeEnv(`[commands.start]\nrun = "true"\n[commands.logs]\nrun = "true"`);
    const r = await env.run(["--json", "doctor"]);
    const report = JSON.parse(r.stdout) as { checks: Array<{ name: string; status: string; detail: string }> };
    const check = report.checks.find((c) => c.name === `project ${PROJECT}: commands`);
    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("start, logs");
  });
});
