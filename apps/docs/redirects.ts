/**
 * Docs URLs that have no page of their own, and the page each one opens.
 *
 * `/docs` and the root of each sidebar group answer with a permanent redirect:
 * `nuxt.config.ts` turns this map into route rules, and
 * `test/redirects.test.ts` checks that every target is a page in
 * `content/docs/`.
 */

/** The sidebar groups, in order, and the first page of each. */
export const GROUP_ENTRY_PAGES = {
	"getting-started": "introduction",
	guides: "review-a-pull-request",
	cli: "overview",
	configuration: "overview",
} as const;

/** The page `/docs` opens on. */
export const DOCS_ENTRY = "/docs/getting-started/introduction";

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
