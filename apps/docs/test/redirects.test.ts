import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DOCS_ENTRY,
	GROUP_ENTRY_PAGES,
	REDIRECTS,
	redirectRules,
} from "../redirects";

const contentRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../content/docs",
);

/** `1.getting-started/1.introduction.md` → `/docs/getting-started/introduction` */
const strip = (name: string) => name.replace(/^\d+\./, "").replace(/\.md$/, "");

const groups = readdirSync(contentRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

const pages = new Set(
	groups.flatMap((group) =>
		readdirSync(resolve(contentRoot, group))
			.filter((file) => file.endsWith(".md"))
			.map((file) => `/docs/${strip(group)}/${strip(file)}`),
	),
);

describe("docs redirects", () => {
	it("finds the docs pages", () => {
		expect(pages.size).toBeGreaterThan(20);
		expect(pages).toContain(DOCS_ENTRY);
	});

	it("sends every exact path to a page that exists", () => {
		for (const [from, to] of Object.entries(REDIRECTS)) {
			if (from.endsWith("/**")) continue;
			expect(pages, `${from} → ${to}`).toContain(to);
		}
	});

	it("forwards the old prefix onto the pages, so each old page URL lands on its page", () => {
		expect(REDIRECTS["/docs/uxd/**"]).toBe("/docs/**");
		for (const page of pages) {
			const old = page.replace(/^\/docs\//, "/docs/uxd/");
			const to = REDIRECTS[old] ?? page;
			expect(pages, `${old} → ${to}`).toContain(to);
		}
	});

	it("gives every group root, under both prefixes, its first page", () => {
		expect(Object.keys(GROUP_ENTRY_PAGES)).toEqual(
			groups.map((group) => strip(group)),
		);
		for (const group of Object.keys(GROUP_ENTRY_PAGES)) {
			const first = REDIRECTS[`/docs/${group}`];
			expect(first).toMatch(new RegExp(`^/docs/${group}/`));
			expect(REDIRECTS[`/docs/uxd/${group}`]).toBe(first);
		}
	});

	it("sends the old scripting guide to its new slug, under both prefixes", () => {
		for (const from of [
			"/docs/guides/script-with-uxd",
			"/docs/uxd/guides/script-with-uxd",
		]) {
			expect(REDIRECTS[from]).toBe("/docs/guides/script-with-testlane");
		}
	});

	it("redirects no page to itself or onto another redirect, so none loops", () => {
		for (const [from, to] of Object.entries(REDIRECTS)) {
			expect(pages.has(from), `${from} is a page`).toBe(false);
			expect(REDIRECTS[to], `${from} → ${to} redirects again`).toBeUndefined();
		}
	});

	it("answers every redirect with a permanent 301", () => {
		const rules = redirectRules();
		expect(Object.keys(rules)).toEqual(Object.keys(REDIRECTS));
		for (const [from, rule] of Object.entries(rules)) {
			expect(rule.redirect).toEqual({ to: REDIRECTS[from], statusCode: 301 });
		}
	});
});
