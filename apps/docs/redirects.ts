/**
 * Old docs URLs and where they land now.
 *
 * Until 2.0 the docs lived under `/docs/uxd/<group>/<page>`, and before that
 * under `/docs/<group>/<page>`, which is where they live again. Every old URL
 * keeps working with a permanent redirect: `nuxt.config.ts` turns this map into
 * route rules, and `test/redirects.test.ts` checks that every target is a page
 * in `content/docs/`.
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

/** The old prefix, from when the docs were one section named after the CLI. */
const OLD_PREFIX = "/docs/uxd";

/** The guide on scripting, whose slug named the CLI. */
const SCRIPTING_GUIDE = "/docs/guides/script-with-testlane";

/**
 * Exact paths and where each redirects to. A path ending in `/**` forwards the
 * rest of the URL, so `/docs/uxd/cli/exit-codes` goes to `/docs/cli/exit-codes`.
 * Nitro applies the most specific rule, so the exact paths win over the splat.
 */
export const REDIRECTS: Record<string, string> = {
	"/docs": DOCS_ENTRY,
	[OLD_PREFIX]: DOCS_ENTRY,
	[`${OLD_PREFIX}/**`]: "/docs/**",
	// The group roots have no page of their own, under either prefix.
	...Object.fromEntries(
		Object.entries(GROUP_ENTRY_PAGES).flatMap(([group, page]) => [
			[`/docs/${group}`, `/docs/${group}/${page}`],
			[`${OLD_PREFIX}/${group}`, `/docs/${group}/${page}`],
		]),
	),
	"/docs/guides/script-with-uxd": SCRIPTING_GUIDE,
	[`${OLD_PREFIX}/guides/script-with-uxd`]: SCRIPTING_GUIDE,
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
