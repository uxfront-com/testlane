// The search and AI search checks `pnpm --filter @uxfront/docs check:seo` runs on
// the static build in dist. The parsing profile and the rules keep exactly what the
// site's own checker read and checked before (apps/docs/README.md, "Search and AI
// search").
import { defineConfig } from "@uxfront/site-checks";

export default defineConfig({
	site: "https://testlane.dev",
	parse: {
		scope: "head-element",
		titleScope: "head-element",
		titleTag: "plain-text",
		trimTitle: "after-decode",
		quotes: "any",
		caseSensitiveTags: false,
		tagEnd: "space",
		metaKey: "name-or-property",
		trimValues: false,
		decode: ["numeric", "quot", "apos", "lt", "gt", "amp"],
		decodeOrder: "numeric-first",
		decodeIgnoreCase: false,
		count: "code-points",
		h1: "anywhere",
		nodes: "graph-deep",
		typeArrays: true,
		jsonLdType: "prefix-any-case",
		blankLines: "whitespace",
		trimSitemap: true,
		mergeDuplicateLocs: true,
		headersParser: "lines",
	},
	rules: {
		lastmod: { format: "w3c", realDate: "date-only" },
		// A commit date is the committer's local date, up to 14 hours ahead of UTC.
		"lastmod-future": { skewHours: 14 },
		"sitemap-pages": { paths: "exact-slash" },
		"sitemap-indexable": {
			sources: [
				{
					type: "meta",
					names: ["robots", "googlebot"],
					values: ["noindex", "none"],
					anyCaseNames: true,
					scope: "document",
				},
				{ type: "refresh" },
				{ type: "files", files: ["404.html", "200.html"] },
				{ type: "headers", hosts: "drop", values: ["noindex", "none"] },
			],
		},
		"sitemap-coverage": true,
		title: { exactlyOne: true, nonEmpty: true },
		description: { exactlyOne: true },
		canonical: { exactlyOne: true, rel: "exact-any-case" },
		lang: { lang: "en" },
		"open-graph": { url: "canonical" },
		"og-image-alt": true,
		"meta-conflicts": true,
		"og-image-size-tags": true,
		"og-image-file": { types: ["png", "jpeg"], png: "signature" },
		"twitter-text": true,
		"json-ld-types": {
			types: {
				"/": ["WebSite", "SoftwareSourceCode", "Organization"],
				"/docs/*": ["TechArticle", "BreadcrumbList"],
			},
		},
		"json-ld-breadcrumbs": {
			scope: ["/docs/*"],
			nodes: "first",
			item: ["url", "id"],
			nonArray: "iterate",
		},
		"json-ld-article": { scope: ["/docs/*"] },
		// useUxHead writes an Organization named Testlane, which the site drops on /.
		"json-ld-organization": { name: "Testlane", scope: ["/"] },
		"robots-sitemap": { match: "field" },
		"robots-crawlers": { allow: false, case: "insensitive" },
		"robots-no-disallow": { match: "groups" },
		llms: { first: "non-empty" },
		"llms-summary": { position: "any" },
		"llms-links": { scope: ["/docs/*"], form: "parens" },
		"llms-full": true,
		"markdown-clean": { files: ["llms-full.txt", "raw/**/*.md"], tables: "anywhere" },
		"markdown-copy": { scope: ["/docs/*"] },
		"markdown-alternate": { scope: ["/docs/*"] },
		"redirects-permanent": { needsDestination: false },
	},
});
