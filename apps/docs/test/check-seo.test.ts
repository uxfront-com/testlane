import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	checkDist,
	imageSize,
	lastmodProblem,
	parseRobots,
	redirectProblems,
} from "../scripts/check-seo.mjs";

const SITE = "https://testlane.dev";
const NOW = new Date("2026-11-16T12:00:00Z");

/** A PNG header that says it's width × height. */
function png(width: number, height: number) {
	const bytes = Buffer.alloc(33);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
	bytes.writeUInt32BE(13, 8);
	bytes.write("IHDR", 12, "ascii");
	bytes.writeUInt32BE(width, 16);
	bytes.writeUInt32BE(height, 20);
	return bytes;
}

/** A JPEG with one SOF0 segment that says it's width × height. */
function jpeg(width: number, height: number) {
	const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
	const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 0, 0, 0, 0x01, 0x01, 0x11, 0x00]);
	sof.writeUInt16BE(height, 5);
	sof.writeUInt16BE(width, 7);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

interface Page {
	path: string;
	title: string;
	description: string;
}

const HOME: Page = {
	path: "/",
	title: "Testlane: run any pull request locally",
	description: "Point Testlane at a pull request, branch, commit or link to get it checked out in a worktree.",
};
const DOC: Page = {
	path: "/docs/cli/exit-codes",
	title: "CLI Exit Codes and Error Names - Testlane",
	description: "Every Testlane exit code and its error name, what each one means and the error output around it.",
};

function head(page: Page, extra = "") {
	const url = `${SITE}${page.path}`;
	const image = page.path === "/" ? `${SITE}/og.jpg` : `${SITE}/_og/s/o_1.png`;
	const docs = page.path !== "/";
	const jsonLd = docs
		? [
				{ "@context": "https://schema.org", "@type": "TechArticle", headline: page.title, image, dateModified: "2026-11-15" },
				{
					"@context": "https://schema.org",
					"@type": "BreadcrumbList",
					itemListElement: [{ "@type": "ListItem", position: 1, name: "Exit Codes", item: url }],
				},
			]
		: [
				{
					"@context": "https://schema.org",
					"@graph": [
						{ "@type": "WebSite", name: "Testlane" },
						{ "@type": "SoftwareSourceCode", name: "Testlane" },
						{ "@type": "Organization", name: "UXFront" },
					],
				},
			];
	return [
		`<title>${page.title}</title>`,
		`<meta name="description" content="${page.description}">`,
		`<link rel="canonical" href="${url}">`,
		`<meta property="og:title" content="${page.title}">`,
		`<meta property="og:description" content="${page.description}">`,
		`<meta property="og:url" content="${url}">`,
		`<meta property="og:type" content="${docs ? "article" : "website"}">`,
		`<meta property="og:image" content="${image}">`,
		'<meta property="og:image:width" content="1200">',
		'<meta property="og:image:height" content="630">',
		'<meta property="og:image:alt" content="A card.">',
		'<meta name="twitter:card" content="summary_large_image">',
		`<meta name="twitter:title" content="${page.title}">`,
		`<meta name="twitter:description" content="${page.description}">`,
		`<meta name="twitter:image" content="${image}">`,
		'<meta name="robots" content="index, follow">',
		...(docs ? [`<link rel="alternate" type="text/markdown" href="${SITE}/raw${page.path}.md">`] : []),
		...jsonLd.map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`),
		extra,
	].join("\n");
}

function html(page: Page, { headExtra = "", body = "<h1>Title</h1><p>Text</p>" } = {}) {
	return `<!DOCTYPE html><html lang="en"><head>${head(page, headExtra)}</head><body>${body}</body></html>`;
}

const ROBOTS = [
	"User-agent: *",
	"Allow: /",
	"",
	...["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User", "GPTBot", "ClaudeBot", "Google-Extended", "CCBot"].flatMap(
		(agent) => [`User-agent: ${agent}`, "Allow: /", ""],
	),
	`Sitemap: ${SITE}/sitemap.xml`,
].join("\n");

/** A build that passes every rule. */
function writeBuild(dist: string) {
	const write = (file: string, content: string | Buffer) => {
		mkdirSync(dirname(join(dist, file)), { recursive: true });
		writeFileSync(join(dist, file), content);
	};
	write("index.html", html(HOME));
	write("docs/cli/exit-codes.html", html(DOC));
	write("docs/cli.html", '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/docs/cli/overview"></head></html>');
	write("404.html", "<html><head><title>Not found</title></head><body><h1>404</h1></body></html>");
	write("200.html", "<html><head></head><body></body></html>");
	write("og.jpg", jpeg(1200, 630));
	write("_og/s/o_1.png", png(1200, 630));
	write(
		"sitemap.xml",
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			`<url><loc>${SITE}/</loc><lastmod>2026-11-14</lastmod></url>`,
			`<url><loc>${SITE}/docs/cli/exit-codes</loc><lastmod>2026-11-15</lastmod></url>`,
			"</urlset>",
		].join("\n"),
	);
	write("robots.txt", ROBOTS);
	write("llms.txt", `# Testlane\n\n> Any git ref, running locally.\n\n## Docs\n\n- [Exit Codes](${SITE}/raw/docs/cli/exit-codes.md): Every code.\n`);
	write("llms-full.txt", "# Exit Codes\n\n| Code | Name |\n| --- | --- |\n");
	write("raw/docs/cli/exit-codes.md", "# Exit Codes\n\n| Code | Name |\n| --- | --- |\n");
	write("_redirects", "/docs/cli\t/docs/cli/overview\t301\n");
	write("_headers", "/_nuxt/*\n  X-Robots-Tag: noindex\n/*\n  X-Content-Type-Options: nosniff\n");
}

describe("checkDist", () => {
	let dist: string;
	beforeEach(() => {
		dist = mkdtempSync(join(tmpdir(), "check-seo-"));
		writeBuild(dist);
	});
	afterEach(() => rmSync(dist, { recursive: true, force: true }));

	const problems = () =>
		checkDist(dist, { now: NOW }).flatMap(({ name, problems }) => problems.map((p: string) => `${name}  ${p}`));
	const edit = (file: string, change: (text: string) => string) =>
		writeFileSync(join(dist, file), change(readFileSync(join(dist, file), "utf8")));

	it("passes a build that meets every rule, and leaves out redirect stubs and fallbacks", () => {
		expect(problems()).toEqual([]);
		expect(checkDist(dist, { now: NOW }).map((r: { name: string }) => r.name)).toEqual([
			"sitemap.xml",
			"/",
			"/docs/cli/exit-codes",
			"robots.txt",
			"llms.txt",
			"markdown copies",
			"_redirects",
		]);
	});

	it("names the page with a description out of range", () => {
		edit("docs/cli/exit-codes.html", (t) => t.replace(DOC.description, DOC.description.slice(0, 50)));
		expect(problems()).toContain("/docs/cli/exit-codes  description: 50 characters, needs 70 to 160");
	});

	it("names the page with a title over 60 characters, and duplicate titles", () => {
		edit("index.html", (t) => t.replace(`<title>${HOME.title}</title>`, `<title>${DOC.title}${"x".repeat(20)}</title>`));
		expect(problems()).toContain(`/  title: 61 characters, needs 60 or fewer: ${DOC.title}${"x".repeat(20)}`);
		edit("index.html", (t) => t.replace(`${DOC.title}${"x".repeat(20)}`, DOC.title));
		expect(problems()).toContain("/  title: the same as on /docs/cli/exit-codes");
	});

	it("names the page with a second h1", () => {
		edit("docs/cli/exit-codes.html", (t) => t.replace("<p>Text</p>", "<h1 class='x'>Again</h1>"));
		expect(problems()).toContain("/docs/cli/exit-codes  h1: 2 <h1> elements, needs exactly one");
	});

	it("names a page that left the sitemap", () => {
		edit("sitemap.xml", (t) => t.replace(/<url><loc>[^<]*exit-codes<\/loc>.*<\/url>\n/, ""));
		expect(problems()).toContain(`sitemap.xml  sitemap: ${SITE}/docs/cli/exit-codes is indexable but not in the sitemap`);
	});

	it("names a sitemap URL with no page, or a page that's noindex", () => {
		edit("docs/cli/exit-codes.html", (t) => t.replace('content="index, follow"', 'content="noindex, nofollow"'));
		expect(problems()).toContain(`sitemap.xml  sitemap: ${SITE}/docs/cli/exit-codes isn't an indexable page in the build`);
	});

	it("names a page that _headers keeps out of search", () => {
		edit("_headers", (t) => `${t}/docs/cli/*\n  X-Robots-Tag: noindex\n`);
		expect(problems()).toContain(`sitemap.xml  sitemap: ${SITE}/docs/cli/exit-codes isn't an indexable page in the build`);
	});

	it("names the page with a JSON-LD block that doesn't parse", () => {
		edit("docs/cli/exit-codes.html", (t) => t.replace('"@type":"BreadcrumbList",', '"@type":"BreadcrumbList",,'));
		expect(problems().some((p) => p.startsWith("/docs/cli/exit-codes  json-ld: block 2 doesn't parse"))).toBe(true);
	});

	it("names a homepage that calls Testlane an Organization or misses a node", () => {
		edit("index.html", (t) => t.replace('{"@type":"SoftwareSourceCode","name":"Testlane"}', '{"@type":"Organization","name":"Testlane"}'));
		expect(problems()).toEqual([
			"/  json-ld: no SoftwareSourceCode",
			"/  json-ld: an Organization named Testlane, which is software",
		]);
	});

	it("names a breadcrumb that points outside the sitemap", () => {
		edit("docs/cli/exit-codes.html", (t) => t.replace(`"item":"${SITE}/docs/cli/exit-codes"`, `"item":"${SITE}/docs/cli"`));
		expect(problems()).toContain(`/docs/cli/exit-codes  json-ld: breadcrumb "Exit Codes" points at ${SITE}/docs/cli, which isn't in the sitemap`);
	});

	it("names an AI crawler robots.txt dropped", () => {
		edit("robots.txt", (t) => t.replace("User-agent: GPTBot\nAllow: /\n", ""));
		expect(problems()).toEqual(["robots.txt  ai crawlers: no group for GPTBot"]);
	});

	it("names a robots.txt that disallows the site or has no sitemap", () => {
		edit("robots.txt", (t) => t.replace("User-agent: *\nAllow: /", "User-agent: *\nDisallow: /").replace(/Sitemap:.*/, ""));
		expect(problems()).toEqual([
			`robots.txt  sitemap: no "Sitemap: ${SITE}/sitemap.xml" line`,
			"robots.txt  disallow: \"Disallow: /\" for *",
		]);
	});

	it("names an Open Graph image of the wrong size, in the tags or the file", () => {
		writeFileSync(join(dist, "_og/s/o_1.png"), png(1200, 600));
		expect(problems()).toEqual(["/docs/cli/exit-codes  og:image size: the image is 1200×600, needs 1200×630"]);
		edit("index.html", (t) => t.replace('og:image:height" content="630"', 'og:image:height" content="600"'));
		expect(problems()).toContain("/  og:image size: the tags say 1200×600, needs 1200×630");
	});

	it("names missing social tags and an og:url that isn't the canonical", () => {
		edit("docs/cli/exit-codes.html", (t) =>
			t.replace(/<meta name="twitter:title"[^>]*>/, "").replace(`og:url" content="${SITE}/docs/cli/exit-codes"`, `og:url" content="${SITE}/x"`),
		);
		expect(problems()).toEqual([
			"/docs/cli/exit-codes  twitter:title: missing",
			`/docs/cli/exit-codes  og:url: ${SITE}/x isn't the canonical URL`,
		]);
	});

	it("names a canonical that isn't the sitemap URL, and a missing lang", () => {
		edit("index.html", (t) => t.replace(`href="${SITE}/"`, 'href="https://www.testlane.dev/"').replace(' lang="en"', ""));
		expect(problems()).toEqual([
			'/  lang: <html lang="">, needs lang="en"',
			`/  canonical: https://www.testlane.dev/ isn't the page's sitemap URL ${SITE}/`,
			`/  og:url: ${SITE}/ isn't the canonical URL`,
		]);
	});

	it("names a lastmod that's missing, malformed or in the future", () => {
		edit("sitemap.xml", (t) =>
			t.replace("<lastmod>2026-11-14</lastmod>", "").replace("2026-11-15", "2026-11-18"),
		);
		expect(problems()).toEqual([
			`sitemap.xml  lastmod: no <lastmod> for ${SITE}/`,
			`sitemap.xml  lastmod: <lastmod> 2026-11-18 is in the future for ${SITE}/docs/cli/exit-codes`,
			"/docs/cli/exit-codes  json-ld: the TechArticle's dateModified 2026-11-15 isn't the sitemap's 2026-11-18",
		]);
	});

	it("names a docs page without its Markdown copy or link, and an llms.txt without the link", () => {
		rmSync(join(dist, "raw"), { recursive: true });
		edit("llms.txt", (t) => t.replace(/- \[Exit Codes\].*\n/, ""));
		edit("docs/cli/exit-codes.html", (t) => t.replace(/<link rel="alternate"[^>]*>/, ""));
		expect(problems()).toEqual([
			`/docs/cli/exit-codes  markdown link: no <link rel="alternate" type="text/markdown" href="${SITE}/raw/docs/cli/exit-codes.md">`,
			"/docs/cli/exit-codes  markdown copy: raw/docs/cli/exit-codes.md isn't in the build",
			`llms.txt  links: no link to ${SITE}/raw/docs/cli/exit-codes.md`,
		]);
	});

	it("names Markdown copies with HTML tables or MDC residue", () => {
		writeFileSync(join(dist, "raw/docs/cli/exit-codes.md"), "<table>\n<tr><td>0</td></tr>\n</table>\n");
		writeFileSync(join(dist, "llms-full.txt"), '[a](https://x){rel="&#x22;nofollow&#x22;"}');
		expect(problems()).toEqual([
			"markdown copies  mdc residue: llms-full.txt has &#x22;",
			"markdown copies  html table: raw/docs/cli/exit-codes.md has a <table>",
		]);
	});

	it("names a temporary redirect", () => {
		writeFileSync(join(dist, "_redirects"), "/docs\t/docs/intro\t307\n/old /new\n");
		expect(problems()).toEqual([
			"_redirects  redirect: `/docs` redirects with 307, not a permanent 301 or 308",
			"_redirects  redirect: `/old` redirects with 302, not a permanent 301 or 308",
		]);
	});
});

describe("imageSize", () => {
	it("reads a PNG's and a JPEG's size, and nothing else", () => {
		expect(imageSize(png(1200, 630))).toEqual({ type: "png", width: 1200, height: 630 });
		expect(imageSize(jpeg(1200, 630))).toEqual({ type: "jpeg", width: 1200, height: 630 });
		expect(imageSize(Buffer.from("GIF89a"))).toBeUndefined();
		expect(imageSize(Buffer.alloc(0))).toBeUndefined();
	});
});

describe("lastmodProblem", () => {
	it("accepts a W3C date or datetime up to the committer's time zone ahead", () => {
		expect(lastmodProblem("2026-11-16", NOW)).toBeUndefined();
		expect(lastmodProblem("2026-11-17", NOW)).toBeUndefined();
		expect(lastmodProblem("2026-11-16T10:00:00+02:00", NOW)).toBeUndefined();
	});

	it("rejects a missing, malformed, impossible or future date", () => {
		expect(lastmodProblem(undefined, NOW)).toBe("no <lastmod>");
		expect(lastmodProblem("16/11/2026", NOW)).toMatch(/isn't a W3C date/);
		expect(lastmodProblem("2026-02-30", NOW)).toMatch(/isn't a real date/);
		expect(lastmodProblem("2026-11-18", NOW)).toMatch(/in the future/);
	});
});

describe("parseRobots", () => {
	it("groups consecutive user agents and reads the sitemap lines", () => {
		expect(parseRobots("User-agent: a\nUser-agent: B\nAllow: /\n\nUser-agent: c\nDisallow: /x # no\nSitemap: https://x/s.xml")).toEqual({
			groups: [
				{ agents: ["a", "b"], rules: [{ field: "allow", value: "/" }] },
				{ agents: ["c"], rules: [{ field: "disallow", value: "/x" }] },
			],
			sitemaps: ["https://x/s.xml"],
		});
	});
});

describe("redirectProblems", () => {
	it("accepts permanent redirects and rewrites, and skips comments", () => {
		expect(redirectProblems("# note\n/a /b 301\n/c /d 308\n/e /f 200\n\n")).toEqual([]);
	});
});
