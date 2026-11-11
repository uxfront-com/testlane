import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HELP, PKG_NAME, version } from "../../src/cli/help.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
};

describe("version — resolved from uxd's own package.json", () => {
  // Regression: the lookup matched the name "uxd" while the manifest says
  // "@uxfront/uxd", so every run fell through to the "0.0.0" fallback.
  it("matches the name declared in package.json", () => {
    expect(PKG_NAME).toBe(pkg.name);
  });

  it("returns the version from package.json, not the fallback", () => {
    expect(version()).toBe(pkg.version);
    expect(version()).not.toBe("0.0.0");
  });
});

describe("help — verb lists", () => {
  it("P1-C9 — lists start, stop and logs as workspace verbs and ps as a project verb", () => {
    const section = (name: string) => HELP.split(`${name}\n`)[1]!.split("\n\n")[0]!;
    for (const verb of ["start", "stop", "logs"]) {
      expect(section("WORKSPACE VERBS")).toMatch(new RegExp(`^  ${verb}\\b`, "m"));
    }
    expect(section("PROJECT VERBS")).toMatch(/^  ps\b/m);
    expect(HELP).toContain("uxd <project> [list|clean|ps] [flags]");
  });
});
