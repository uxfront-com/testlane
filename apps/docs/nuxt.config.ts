import { SITE_URL } from "./app/data/site";
import { DOCS_ENTRY, redirectRules } from "./redirects";

const DESCRIPTION =
	"Testlane materializes any git ref of a configured project into an isolated, runnable local workspace with one command.";

// Docus reads the site URL from the environment: for canonical URLs, robots.txt
// and llms.txt at build time, and for the sitemap when it's prerendered.
process.env.NUXT_SITE_URL ||= SITE_URL;

// Workers Builds sets WORKERS_CI. There the site builds as static files that
// the root wrangler.jsonc serves. Without a preset, Nitro would pick
// cloudflare-module, whose generated wrangler.json replaces wrangler.jsonc and
// points at a server entry that a static build never writes. An explicit
// NITRO_PRESET still wins. Every other build keeps Nitro's server output, which
// is never indexed (routeRules below).
const STATIC_BUILD = Boolean(process.env.WORKERS_CI);
if (STATIC_BUILD) {
	process.env.NITRO_PRESET ||= "cloudflare_pages_static";
}

// The AI crawlers robots.txt names, each allowed the whole site: the answer
// engines, then the crawlers that gather training data.
const AI_CRAWLERS = [
	"OAI-SearchBot",
	"ChatGPT-User",
	"PerplexityBot",
	"Claude-SearchBot",
	"Claude-User",
	"GPTBot",
	"ClaudeBot",
	"Google-Extended",
	"CCBot",
];

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: "2025-07-22",
	ssr: true,

	extends: [
		// The homepage kit: components, fonts, head helpers and critical-path loading.
		"@uxfront/layer-ui",
		// The docs theme: Docus, which renders content/docs/ at /docs (see app/app.vue),
		// signed "by UXFront" in its header (`docsTheme` in app/app.config.ts).
		"@uxfront/layer-docs",
	],

	runtimeConfig: {
		public: {
			siteUrl: SITE_URL,
		},
	},

	// The docs header and title template (Docus falls back to the package name).
	site: {
		name: "Testlane",
	},

	// llms.txt and llms-full.txt. Docus takes their description from package.json,
	// which this private app doesn't describe.
	llms: {
		description: DESCRIPTION,
		full: { description: DESCRIPTION },
	},

	content: {
		build: {
			markdown: {
				highlight: {
					// Project files are TOML. Layers concatenate arrays, so this joins
					// the languages Docus and @uxfront/layer-docs highlight.
					langs: ["toml"],
				},
			},
		},
	},

	// robots.txt. Layers concatenate arrays, so these groups join Docus's
	// `User-agent: *` group. The `Sitemap:` line points at
	// server/routes/sitemap.xml.ts, since Docus no longer sets one.
	robots: {
		groups: AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
		sitemap: "/sitemap.xml",
	},

	// nuxt-agent-discovery, which Docus installs, serves the Markdown copies at
	// /raw/<path>.md from server/agent/source.ts, and llms.txt, sitemap.md and the
	// discovery links around them. robots.txt keeps the site's own crawler list
	// (AI_CRAWLERS) and no Content-Signal line, so the module adds neither. The
	// static build never writes /.well-known/api-catalog, so it's off, and the
	// Link header on / doesn't point at a page that 404s.
	agentDiscovery: {
		source: "~~/server/agent/source",
		robots: { aiPolicy: false, contentSignal: false },
		discovery: { apiCatalog: false },
	},

	// @nuxtjs/sitemap is off, so server/routes/sitemap.xml.ts serves
	// /sitemap.xml with the homepage and each page's <lastmod>.
	sitemap: {
		enabled: false,
	},

	// nuxt-schema-org is off: app/plugins/structured-data.ts and the docs page
	// write the site's JSON-LD, so it would add a second graph to every page.
	schemaOrg: {
		enabled: false,
	},

	// The docs pages' Open Graph cards, at the 1200×630 the social sites ask
	// for (audit G1). nuxt-og-image defaults to 1200×600.
	ogImage: {
		defaults: { width: 1200, height: 630 },
	},

	// Docus's MCP server is off, like on the other UXFront docs sites.
	mcp: {
		enabled: false,
	},

	app: {
		head: {
			htmlAttrs: { lang: "en" },
			meta: [
				// HTML requires the label "utf-8" in <meta charset>: "utf8" is invalid there.
				// oxlint-disable-next-line unicorn/text-encoding-identifier-case
				{ charset: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
			],
			link: [
				{ rel: "icon", href: "/favicon.ico", sizes: "any" },
				{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
				{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			],
		},
	},

	experimental: {
		// Inline the payload on first load (the homepage makes no extra request),
		// and extract it for client-side navigation between docs pages.
		payloadExtraction: "client",
	},

	routeRules: {
		// `/docs` and the group roots (redirects.ts), each a permanent redirect.
		...redirectRules(),
		// Hashed build assets never change, so cache them forever.
		"/_nuxt/**": {
			headers: { "cache-control": "public, max-age=31536000, immutable" },
		},
		// The SPA fallback Nitro writes as 200.html has no content of its own.
		"/200": {
			headers: { "X-Robots-Tag": "noindex" },
		},
		...(STATIC_BUILD
			? {
					// Production: the static build writes these into dist/_headers. No CSP,
					// since the scene and Nuxt's inline payload would need nonces or hashes.
					"/**": {
						headers: {
							"X-Content-Type-Options": "nosniff",
							"Referrer-Policy": "strict-origin-when-cross-origin",
							"Strict-Transport-Security": "max-age=31536000",
						},
					},
				}
			: {
					// Every other build (Vercel, Docker, Nixpacks, the daemon Mac's
					// previews, CI's server build) is a copy of the site on another host,
					// so it's never indexed. @nuxtjs/robots turns this into the robots meta
					// tag on every prerendered page and an X-Robots-Tag header. robots.txt
					// still lets crawlers in, since one that's kept out never reads the
					// noindex. Workers Builds' branch previews are static builds, and
					// Cloudflare sends X-Robots-Tag: noindex on their workers.dev hosts.
					"/**": { robots: "noindex, nofollow" },
				}),
	},

	nitro: {
		// Every page is prerendered. On Workers Builds (WORKERS_CI, above) that's
		// the static production site in dist/. Elsewhere it's a Nitro server
		// (Docker or Nixpacks) with the pages in .output/public.
		prerender: {
			crawlLinks: true,
			// /docs only redirects, so crawling the docs starts from the introduction.
			// Docus doesn't prerender /sitemap.xml, which nothing links to.
			routes: ["/", DOCS_ENTRY, "/sitemap.xml"],
			// Without this a prerendered route that 404s only prints an error, and
			// `nuxt build` still exits 0. A dead link or a renamed content file would
			// ship green, so the docs gate fails the build on one.
			failOnError: true,
		},
	},
});
