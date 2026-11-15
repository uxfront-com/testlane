/**
 * Docs URLs that have no page of their own, and the page each one opens.
 *
 * `/docs`, the root of each sidebar group and the old path of each page that
 * moved answer with a permanent redirect: `nuxt.config.ts` turns this map into
 * route rules, and `test/redirects.test.ts` checks that every target is a page
 * in `content/docs/`.
 */

/** The sidebar groups, in order, and the first page of each. */
export const GROUP_ENTRY_PAGES = {
	"getting-started": "introduction",
	concepts: "how-it-works",
	guides: "review-a-pull-request",
	cli: "overview",
	configuration: "overview",
} as const;

/** The page `/docs` opens on. */
export const DOCS_ENTRY = "/docs/getting-started/introduction";

/**
 * Pages that moved to another group, from their old slug to their new one, so
 * links people saved still open them.
 */
export const MOVED_PAGES: Record<string, string> = {
	// Concepts moved out of Getting started, which now ends at a running workspace.
	"getting-started/how-it-works": "concepts/how-it-works",
	"getting-started/refs": "concepts/refs",
	"getting-started/workspaces": "concepts/workspaces",
};

/** Exact paths and the page each one redirects to. */
export const REDIRECTS: Record<string, string> = {
	"/docs": DOCS_ENTRY,
	// The group roots have no page of their own.
	...Object.fromEntries(
		Object.entries(GROUP_ENTRY_PAGES).map(([group, page]) => [
			`/docs/${group}`,
			`/docs/${group}/${page}`,
		]),
	),
	// Pages that moved keep their old URLs.
	...Object.fromEntries(
		Object.entries(MOVED_PAGES).map(([from, to]) => [
			`/docs/${from}`,
			`/docs/${to}`,
		]),
	),
};

/**
 * The map as Nitro route rules. Each is a 301, since the pages moved for good:
 * Nitro's string form, `{ redirect: "/…" }`, answers 307.
 */
export function redirectRules(): Record<
	string,
	{ redirect: { to: string; statusCode: 301 } }
> {
	return Object.fromEntries(
		Object.entries(REDIRECTS).map(([from, to]) => [
			from,
			{ redirect: { to, statusCode: 301 } },
		]),
	);
}
