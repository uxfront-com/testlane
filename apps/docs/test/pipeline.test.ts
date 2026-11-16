import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKSPACE_VERBS } from "../../../src/cli/verbs";
import { parseRef, slug } from "../../../src/core/resolve";
import { PIPELINE_REFS, PIPELINE_SUBSTEPS, PIPELINE_VERBS, noteParts } from "../app/data/pipeline";

const CONTENT = join(import.meta.dirname, "../content/docs");
const COMMANDS = join(import.meta.dirname, "../../../src/commands");

/** Every docs page, as [path relative to content/docs, source]. */
function pages(dir = CONTENT): [string, string][] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return pages(path);
		if (!entry.name.endsWith(".md")) return [];
		return [[path.slice(CONTENT.length + 1), readFileSync(path, "utf8")]];
	});
}

describe("the pipeline diagram", () => {
	it("shows refs that parse as the kind they stand for", () => {
		for (const { ref, kind } of PIPELINE_REFS) {
			expect(parseRef(ref).kind, ref).toBe(kind);
		}
	});

	it("shows each ref's slug, or its start and an ellipsis", () => {
		for (const { ref, slug: shown } of PIPELINE_REFS) {
			const actual = slug(parseRef(ref));
			if (shown.endsWith("…")) expect(actual.startsWith(shown.slice(0, -1)), ref).toBe(true);
			else expect(actual, ref).toBe(shown);
		}
	});

	it("shows each ref as itself, or as its start and an ellipsis", () => {
		for (const { ref, shownRef } of PIPELINE_REFS) {
			if (shownRef === undefined) continue;
			expect(shownRef.endsWith("…"), shownRef).toBe(true);
			expect(ref.startsWith(shownRef.slice(0, -1)), shownRef).toBe(true);
		}
	});

	it("names only verbs the CLI has", () => {
		for (const verb of PIPELINE_VERBS) {
			expect(WORKSPACE_VERBS, verb).toContain(verb);
		}
	});

	it("says which verbs skip the seed files and setup, the ones that need --setup", () => {
		// A command whose setup is off unless you pass --setup, like checkout.
		const optIn = readdirSync(COMMANDS)
			.filter((file) => readFileSync(join(COMMANDS, file), "utf8").includes('setup: flags.bool("--setup")'))
			.map((file) => file.replace(/\.ts$/, ""))
			.sort();
		expect(optIn.length).toBeGreaterThan(0);
		for (const name of ["Seed files", "Setup"]) {
			const substep = PIPELINE_SUBSTEPS.find((s) => s.name === name);
			const code = noteParts(substep?.when ?? "").filter((_, i) => i % 2);
			expect(code.filter((c) => !c.startsWith("--")).sort(), name).toEqual(optIn);
			expect(code, name).toContain("--setup");
		}
	});

	it("says when each sub-step runs, since none runs every time", () => {
		for (const { name, when } of PIPELINE_SUBSTEPS) {
			expect(when.trim(), name).not.toBe("");
			expect(noteParts(when).length % 2, `${name}: unclosed backtick`).toBe(1);
		}
	});

	it("is on the Introduction, compact, and on How it works, in detail", () => {
		const placed = pages()
			.flatMap(([path, source]) =>
				// By file name without its number, so the check holds when a page moves.
				[...source.matchAll(/^::pipeline-diagram(\{[^}]*\})?$/gm)].map((m) => [
					basename(path).replace(/^\d+\./, ""),
					m[1] ?? "",
				]),
			)
			.sort();
		expect(placed).toEqual([
			["how-it-works.md", '{variant="detail"}'],
			["introduction.md", ""],
		]);
	});

	it("replaces the one-line code block it draws", () => {
		for (const [path, source] of pages()) {
			expect(source, path).not.toMatch(/```\s*\nresolve\(ref\) → materialize/);
		}
	});
});
