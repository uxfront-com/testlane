// Builds dist/ once per test run, for the files that spawn the built CLI
// (packaging.test.ts, mcp.test.ts). Two files building it at once would race
// on dist/, and one could spawn a half-written file.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function setup(): void {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const build = spawnSync("npx", ["tsc", "-p", "tsconfig.build.json"], { cwd: repoRoot, encoding: "utf8" });
  if (build.status !== 0) {
    throw new Error(`build failed:\n${build.stdout}${build.stderr}`);
  }
}
