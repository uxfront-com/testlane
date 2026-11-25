import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DOCS_ENTRY, GROUP_ENTRY_PAGES, MOVED_PAGES, REDIRECTS, redirectRules } from "../redirects";

const contentRoot = resolve(import.meta.dirname, "../content/docs");

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

	it("sends every path to a page that exists", () => {
		for (const [from, to] of Object.entries(REDIRECTS)) {
			expect(pages, `${from} → ${to}`).toContain(to);
		}
	});

	it("gives every group root its first page", () => {
		expect(Object.keys(GROUP_ENTRY_PAGES)).toEqual(groups.map((group) => strip(group)));
		for (const group of Object.keys(GROUP_ENTRY_PAGES)) {
			const first = REDIRECTS[`/docs/${group}`];
			expect(first).toMatch(new RegExp(`^/docs/${group}/`));
		}
	});

	it("sends the concept pages' old paths to their pages under Concepts", () => {
		for (const page of ["how-it-works", "refs", "workspaces"]) {
			const to = `/docs/concepts/${page}`;
			expect(REDIRECTS[`/docs/getting-started/${page}`]).toBe(to);
			expect(pages).toContain(to);
		}
		expect(Object.keys(MOVED_PAGES)).toHaveLength(3);
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
