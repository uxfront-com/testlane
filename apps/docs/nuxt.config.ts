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
// NITRO_PRESET still wins. Every other build keeps Nitro's server output.
if (process.env.WORKERS_CI) {
	process.env.NITRO_PRESET ||= "cloudflare_pages_static";
}

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

					// Docus's default Shiki themes put comments and punctuation below
					// WCAG AA (4.5:1) on the code block's background. The high-contrast
					// GitHub pair clears it in both modes. All three keys are set: Shiki
					// emits a `.light` rule that outranks `default`, so leaving `light`
					// out would keep the old palette in light mode.
					theme: {
						default: "github-light-high-contrast",
						light: "github-light-high-contrast",
						dark: "github-dark-high-contrast",
					},
				},
			},
		},
	},

	// Docus's MCP server is off, like on the other UXFront docs sites.
	mcp: {
		enabled: false,
	},

	app: {
		head: {
			htmlAttrs: { lang: "en" },
			meta: [
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
		// The old docs URLs (redirects.ts), each a permanent redirect.
		...redirectRules(),
		// Hashed build assets never change, so cache them forever.
		"/_nuxt/**": {
			headers: { "cache-control": "public, max-age=31536000, immutable" },
		},
	},

	nitro: {
		// Every page is prerendered. On Workers Builds (WORKERS_CI, above) that's
		// the static production site in dist/. Elsewhere it's a Nitro server
		// (Docker, Nixpacks or Vercel) with the pages in .output/public.
		prerender: {
			crawlLinks: true,
			// /docs only redirects, so crawling the docs starts from the introduction.
			routes: ["/", DOCS_ENTRY],
			// Without this a prerendered route that 404s only prints an error, and
			// `nuxt build` still exits 0. A dead link or a renamed content file would
			// ship green, so the docs gate fails the build on one.
			failOnError: true,
		},
	},
});
