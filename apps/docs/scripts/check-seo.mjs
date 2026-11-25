// Checks a static build of the docs site (WORKERS_CI=1 … generate) for what
// search engines and answer engines read: the tags on every page in the
// sitemap, the sitemap itself, robots.txt, llms.txt, the Markdown copies, the
// structured data and _redirects. It reads files only.
//
//   pnpm --filter @uxfront/docs check:seo        (reads apps/docs/dist)
//   node apps/docs/scripts/check-seo.mjs <dist>
//
// It prints one line per page and file, then a summary, and exits 1 when any
// rule fails. apps/docs/README.md ("Search and AI search") lists the rules.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const SITE_URL = "https://testlane.dev";

/**
 * The crawlers robots.txt names, each allowed in (the plan's Q1). The list is
 * written out here rather than read from nuxt.config.ts, so a crawler dropped
 * from the config fails the check.
 */
export const AI_CRAWLERS = [
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

export const LIMITS = { title: 60, description: [70, 160] };
export const OG_IMAGE = { width: 1200, height: 630 };

// A commit date is the committer's local date, which can be up to 14 hours
// ahead of UTC, so "not in the future" allows that much.
const CLOCK_SKEW_MS = 14 * 60 * 60 * 1000;

/** @param {string} text */
export function decode(text) {
	return text
		.replaceAll(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replaceAll(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
		.replaceAll("&quot;", '"')
		.replaceAll(/&#39;|&apos;/g, "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
}

/**
 * The attributes of every `<name …>` tag in some HTML, lower-cased names and
 * decoded values.
 * @param {string} html
 * @param {string} name
 * @returns {Record<string, string>[]}
 */
export function tagsOf(html, name) {
	const tags =
		html.match(new RegExp(`<${name}(?=[\\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi")) ?? [];
	return tags.map((tag) => {
		/** @type {Record<string, string>} */
		const attributes = {};
		const body = tag.slice(name.length + 1, -1);
		for (const [, key, double, single, bare] of body.matchAll(
			/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g,
		)) {
			attributes[key.toLowerCase()] = decode(double ?? single ?? bare ?? "");
		}
		return attributes;
	});
}

/**
 * The content of each `<meta>` with this name or property.
 * @param {Record<string, string>[]} metas
 * @param {string} key
 */
function metaValues(metas, key) {
	return metas.filter((m) => m.name === key || m.property === key).map((m) => m.content ?? "");
}

/** @param {string} text */
const length = (text) => [...text].length;

/**
 * The width and height of a PNG or JPEG, from its header.
 * @param {Buffer} bytes
 * @returns {{ type: "png" | "jpeg", width: number, height: number } | undefined}
 */
export function imageSize(bytes) {
	if (
		bytes.length >= 24 &&
		bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	) {
		return { type: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
	}
	if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
		let offset = 2;
		while (offset + 9 < bytes.length) {
			if (bytes[offset] !== 0xff) {
				return undefined;
			}
			const marker = bytes[offset + 1];
			// SOF0 to SOF15 hold the frame's size, except DHT, JPG and DAC.
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
				return {
					type: "jpeg",
					height: bytes.readUInt16BE(offset + 5),
					width: bytes.readUInt16BE(offset + 7),
				};
			}
			offset += 2 + bytes.readUInt16BE(offset + 2);
		}
	}
	return undefined;
}

/**
 * The rules of a `_headers` file, each a URL pattern and its headers.
 * @param {string} text
 */
export function parseHeaders(text) {
	/** @type {{ pattern: RegExp, headers: Record<string, string> }[]} */
	const rules = [];
	for (const line of text.split("\n")) {
		if (!line.trim() || line.trim().startsWith("#")) {
			continue;
		}
		if (!/^\s/.test(line)) {
			const source = line.trim().replace(/^https?:\/\/[^/]+/, "");
			const pattern = source
				.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`)
				.replaceAll("*", ".*")
				.replaceAll(/:\w+/g, "[^/]+");
			rules.push({ pattern: new RegExp(`^${pattern}$`), headers: {} });
			continue;
		}
		const at = line.indexOf(":");
		const rule = rules.at(-1);
		if (rule && at > 0) {
			rule.headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
		}
	}
	return rules;
}

/**
 * The problems with a `_redirects` file: any rule that answers 302 or 307,
 * including one with no status, which Cloudflare answers with 302.
 * @param {string} text
 */
export function redirectProblems(text) {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.flatMap((line) => {
			const [from, , status = "302"] = line.split(/\s+/);
			return ["302", "307"].includes(status)
				? [`\`${from}\` redirects with ${status}, not a permanent 301 or 308`]
				: [];
		});
}

/**
 * The groups of a robots.txt, each its user agents and rules.
 * @param {string} text
 */
export function parseRobots(text) {
	/** @type {{ agents: string[], rules: { field: string, value: string }[] }[]} */
	const groups = [];
	/** @type {string[]} */
	const sitemaps = [];
	let open = false;
	for (const raw of text.split("\n")) {
		const line = raw.replace(/#.*/, "").trim();
		const at = line.indexOf(":");
		if (at < 0) {
			continue;
		}
		const field = line.slice(0, at).trim().toLowerCase();
		const value = line.slice(at + 1).trim();
		if (field === "user-agent") {
			if (!open) {
				groups.push({ agents: [], rules: [] });
				open = true;
			}
			groups.at(-1)?.agents.push(value.toLowerCase());
		} else if (field === "sitemap") {
			sitemaps.push(value);
		} else {
			open = false;
			groups.at(-1)?.rules.push({ field, value });
		}
	}
	return { groups, sitemaps };
}

/**
 * The sitemap's URLs and their `<lastmod>`.
 * @param {string} xml
 */
export function parseSitemap(xml) {
	return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => ({
		loc: decode(body.match(/<loc>([^<]*)<\/loc>/)?.[1]?.trim() ?? ""),
		lastmod: body.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1]?.trim(),
	}));
}

/**
 * Whether a `<lastmod>` is a W3C date or datetime, and not in the future.
 * @param {string | undefined} lastmod
 * @param {Date} now
 */
export function lastmodProblem(lastmod, now) {
	if (!lastmod) {
		return "no <lastmod>";
	}
	if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(lastmod)) {
		return `<lastmod> ${lastmod} isn't a W3C date like 2026-11-16`;
	}
	const date = new Date(lastmod.length === 10 ? `${lastmod}T00:00:00Z` : lastmod);
	if (
		Number.isNaN(date.getTime()) ||
		(lastmod.length === 10 && date.toISOString().slice(0, 10) !== lastmod)
	) {
		return `<lastmod> ${lastmod} isn't a real date`;
	}
	if (date.getTime() > now.getTime() + CLOCK_SKEW_MS) {
		return `<lastmod> ${lastmod} is in the future`;
	}
	return undefined;
}

/**
 * Every node of a JSON-LD value, the `@graph`'s included.
 * @param {unknown} value
 * @returns {Record<string, any>[]}
 */
function nodesOf(value) {
	if (Array.isArray(value)) {
		return value.flatMap(nodesOf);
	}
	if (value && typeof value === "object") {
		const node = /** @type {Record<string, any>} */ (value);
		return node["@graph"] ? nodesOf(node["@graph"]) : [node];
	}
	return [];
}

/** @param {Record<string, any>} node @param {string} type */
const isType = (node, type) => [node["@type"]].flat().includes(type);

/** The site URL of a file in the build, or undefined for one that isn't a page. */
function pageUrl(file) {
	const path = file.split(sep).join("/");
	if (!path.endsWith(".html")) {
		return undefined;
	}
	if (path === "index.html") {
		return `${SITE_URL}/`;
	}
	if (path.endsWith("/index.html")) {
		return `${SITE_URL}/${path.slice(0, -"index.html".length)}`;
	}
	return `${SITE_URL}/${path.slice(0, -".html".length)}`;
}

/** @param {string} dir */
function htmlFiles(dir) {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".html"))
		.sort();
}

/**
 * Whether a page is meant for search: not the 404 or SPA fallback, not one of
 * the refresh stubs Nitro writes for redirects, and not kept out by `noindex`.
 * @param {string} file
 * @param {string} html
 * @param {string} url
 * @param {ReturnType<typeof parseHeaders>} headers
 */
function indexability(file, html, url, headers) {
	if (["404.html", "200.html"].includes(file)) {
		return "fallback";
	}
	const metas = tagsOf(html, "meta");
	if (metas.some((m) => m["http-equiv"]?.toLowerCase() === "refresh")) {
		return "redirect";
	}
	if (noindex(metas, url, headers)) {
		return "noindex";
	}
	return "indexable";
}

/**
 * The source of a `noindex`: a robots meta tag or an X-Robots-Tag in `_headers`.
 * @param {Record<string, string>[]} metas
 * @param {string} url
 * @param {ReturnType<typeof parseHeaders>} headers
 */
function noindex(metas, url, headers) {
	const meta = metas.find(
		(m) =>
			["robots", "googlebot"].includes(m.name?.toLowerCase() ?? "") &&
			/noindex|none/i.test(m.content ?? ""),
	);
	if (meta) {
		return `<meta name="${meta.name}" content="${meta.content}">`;
	}
	const path = url.slice(SITE_URL.length) || "/";
	const rule = headers.find(
		(r) => r.pattern.test(path) && /noindex|none/i.test(r.headers["x-robots-tag"] ?? ""),
	);
	return rule ? `X-Robots-Tag: ${rule.headers["x-robots-tag"]} in _headers` : undefined;
}

/**
 * Checks one page in the sitemap.
 * @param {{ dist: string, url: string, html: string, sitemap: Map<string, string | undefined>, headers: ReturnType<typeof parseHeaders> }} input
 */
export function checkPage({ dist, url, html, sitemap, headers }) {
	/** @type {string[]} */
	const problems = [];
	const fail = (rule, message) => problems.push(`${rule}: ${message}`);
	const head = html.match(/<head[\s>][\s\S]*?<\/head>/i)?.[0] ?? "";
	const metas = tagsOf(head, "meta");
	const links = tagsOf(head, "link");
	const path = url.slice(SITE_URL.length) || "/";

	const titles = [...head.matchAll(/<title[^>]*>([^<]*)<\/title>/gi)].map((m) =>
		decode(m[1]).trim(),
	);
	if (titles.length !== 1) {
		fail("title", `${titles.length} <title> tags, needs one`);
	} else if (!titles[0]) {
		fail("title", "the <title> is empty");
	} else if (length(titles[0]) > LIMITS.title) {
		fail("title", `${length(titles[0])} characters, needs ${LIMITS.title} or fewer: ${titles[0]}`);
	}

	const descriptions = metaValues(metas, "description");
	const [min, max] = LIMITS.description;
	if (descriptions.length !== 1) {
		fail("description", `${descriptions.length} meta descriptions, needs one`);
	} else if (length(descriptions[0]) < min || length(descriptions[0]) > max) {
		fail("description", `${length(descriptions[0])} characters, needs ${min} to ${max}`);
	}

	const h1s = html.match(/<h1(?=[\s>])/gi)?.length ?? 0;
	if (h1s !== 1) {
		fail("h1", `${h1s} <h1> elements, needs exactly one`);
	}

	const lang = tagsOf(html, "html")[0]?.lang;
	if (lang !== "en") {
		fail("lang", `<html lang="${lang ?? ""}">, needs lang="en"`);
	}

	const canonicals = links.filter((l) => l.rel?.toLowerCase() === "canonical").map((l) => l.href);
	if (canonicals.length !== 1) {
		fail("canonical", `${canonicals.length} canonical links, needs one`);
	} else if (canonicals[0] !== url) {
		fail("canonical", `${canonicals[0]} isn't the page's sitemap URL ${url}`);
	}

	for (const key of [
		"og:title",
		"og:description",
		"og:url",
		"og:type",
		"og:image",
		"og:image:alt",
		"twitter:title",
		"twitter:description",
		"twitter:image",
	]) {
		const values = metaValues(metas, key);
		if (!values.length || !values[0].trim()) {
			fail(key, "missing");
		} else if (new Set(values).size > 1) {
			fail(key, `${values.length} different values`);
		}
	}
	const og = (key) => metaValues(metas, key)[0];
	if (og("og:url") && og("og:url") !== canonicals[0]) {
		fail("og:url", `${og("og:url")} isn't the canonical URL`);
	}
	if (og("twitter:card") !== "summary_large_image") {
		fail("twitter:card", `"${og("twitter:card") ?? ""}", needs summary_large_image`);
	}
	if (
		og("og:image:width") !== String(OG_IMAGE.width) ||
		og("og:image:height") !== String(OG_IMAGE.height)
	) {
		fail(
			"og:image size",
			`the tags say ${og("og:image:width") ?? "?"}×${og("og:image:height") ?? "?"}, needs ${OG_IMAGE.width}×${OG_IMAGE.height}`,
		);
	}
	const image = og("og:image");
	if (image) {
		if (!image.startsWith(`${SITE_URL}/`)) {
			fail("og:image", `${image} isn't on ${SITE_URL}`);
		} else {
			const file = join(dist, decodeURIComponent(new URL(image).pathname));
			const size = existsSync(file) ? imageSize(readFileSync(file)) : undefined;
			if (!existsSync(file)) {
				fail("og:image", `${image} has no file in the build`);
			} else if (!size) {
				fail("og:image", `${image} isn't a PNG or JPEG`);
			} else if (size.width !== OG_IMAGE.width || size.height !== OG_IMAGE.height) {
				fail(
					"og:image size",
					`the image is ${size.width}×${size.height}, needs ${OG_IMAGE.width}×${OG_IMAGE.height}`,
				);
			}
		}
	}

	const blocked = noindex(metas, url, headers);
	if (blocked) {
		fail("noindex", blocked);
	}

	const docs = path.startsWith("/docs/");
	if (docs) {
		const markdown = `${SITE_URL}/raw${path}.md`;
		const alternates = links
			.filter((l) => l.rel?.toLowerCase() === "alternate" && l.type === "text/markdown")
			.map((l) => l.href);
		if (!alternates.includes(markdown)) {
			fail("markdown link", `no <link rel="alternate" type="text/markdown" href="${markdown}">`);
		}
		if (!existsSync(join(dist, `raw${path}.md`))) {
			fail("markdown copy", `raw${path}.md isn't in the build`);
		}
	}

	/** @type {Record<string, any>[]} */
	const nodes = [];
	for (const [index, script] of [
		...html.matchAll(
			/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
		),
	].entries()) {
		try {
			nodes.push(...nodesOf(JSON.parse(script[1])));
		} catch (error) {
			fail(
				"json-ld",
				`block ${index + 1} doesn't parse: ${error instanceof Error ? error.message : error}`,
			);
		}
	}
	if (path === "/") {
		for (const type of ["WebSite", "SoftwareSourceCode", "Organization"]) {
			if (!nodes.some((n) => isType(n, type))) {
				fail("json-ld", `no ${type}`);
			}
		}
		if (nodes.some((n) => isType(n, "Organization") && n.name === "Testlane")) {
			fail("json-ld", "an Organization named Testlane, which is software");
		}
	}
	if (docs) {
		const article = nodes.find((n) => isType(n, "TechArticle"));
		if (!article) {
			fail("json-ld", "no TechArticle");
		} else {
			if (image && article.image !== image) {
				fail("json-ld", `the TechArticle's image ${article.image} isn't the og:image`);
			}
			if (sitemap.has(url) && article.dateModified !== sitemap.get(url)) {
				fail(
					"json-ld",
					`the TechArticle's dateModified ${article.dateModified} isn't the sitemap's ${sitemap.get(url)}`,
				);
			}
		}
		const breadcrumbs = nodes.find((n) => isType(n, "BreadcrumbList"));
		if (!breadcrumbs) {
			fail("json-ld", "no BreadcrumbList");
		} else {
			for (const item of breadcrumbs.itemListElement ?? []) {
				const target = typeof item.item === "string" ? item.item : item.item?.["@id"];
				if (!sitemap.has(target)) {
					fail(
						"json-ld",
						`breadcrumb "${item.name}" points at ${target}, which isn't in the sitemap`,
					);
				}
			}
		}
	}

	return problems;
}

/**
 * Checks a build and returns the problems of each page and file.
 * @param {string} dist
 * @param {{ now?: Date }} [options]
 * @returns {{ name: string, problems: string[] }[]}
 */
export function checkDist(dist, { now = new Date() } = {}) {
	const read = (file) =>
		existsSync(join(dist, file)) ? readFileSync(join(dist, file), "utf8") : undefined;
	const headers = parseHeaders(read("_headers") ?? "");
	/** @type {{ name: string, problems: string[] }[]} */
	const results = [];

	// The sitemap: its URLs are exactly the indexable pages, each with a date.
	const sitemapXml = read("sitemap.xml");
	const entries = sitemapXml ? parseSitemap(sitemapXml) : [];
	const sitemap = new Map(entries.map((e) => [e.loc, e.lastmod]));
	const sitemapProblems = sitemapXml ? [] : ["sitemap.xml: missing"];
	const indexable = new Map();
	for (const file of htmlFiles(dist)) {
		const url = pageUrl(file);
		const html = readFileSync(join(dist, file), "utf8");
		if (url && indexability(file, html, url, headers) === "indexable") {
			indexable.set(url, html);
		}
	}
	for (const { loc, lastmod } of entries) {
		if (!indexable.has(loc)) {
			sitemapProblems.push(`sitemap: ${loc} isn't an indexable page in the build`);
		}
		const problem = lastmodProblem(lastmod, now);
		if (problem) {
			sitemapProblems.push(`lastmod: ${problem} for ${loc}`);
		}
	}
	for (const url of indexable.keys()) {
		if (!sitemap.has(url)) {
			sitemapProblems.push(`sitemap: ${url} is indexable but not in the sitemap`);
		}
	}
	results.push({ name: "sitemap.xml", problems: sitemapProblems });

	// Every page in the sitemap, and every indexable page left out of it.
	const titles = new Map();
	const descriptions = new Map();
	for (const url of new Set([...sitemap.keys(), ...indexable.keys()])) {
		const html = indexable.get(url);
		const name = url.slice(SITE_URL.length) || "/";
		if (!html) {
			continue;
		}
		const problems = checkPage({ dist, url, html, sitemap, headers });
		const head = html.match(/<head[\s>][\s\S]*?<\/head>/i)?.[0] ?? "";
		const title = decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
		const description = metaValues(tagsOf(head, "meta"), "description")[0];
		for (const [map, value] of [
			[titles, title],
			[descriptions, description],
		]) {
			if (value) {
				map.set(value, [...(map.get(value) ?? []), name]);
			}
		}
		results.push({ name, problems });
	}
	for (const [rule, map] of [
		["title", titles],
		["description", descriptions],
	]) {
		for (const pages of map.values()) {
			for (const name of pages.length > 1 ? pages : []) {
				results
					.find((r) => r.name === name)
					?.problems.push(`${rule}: the same as on ${pages.filter((p) => p !== name).join(", ")}`);
			}
		}
	}

	// robots.txt: the sitemap, a group that lets each AI crawler in, no Disallow: /.
	const robotsText = read("robots.txt");
	const robotsProblems = robotsText ? [] : ["robots.txt: missing"];
	if (robotsText) {
		const robots = parseRobots(robotsText);
		if (!robots.sitemaps.includes(`${SITE_URL}/sitemap.xml`)) {
			robotsProblems.push(`sitemap: no "Sitemap: ${SITE_URL}/sitemap.xml" line`);
		}
		for (const crawler of AI_CRAWLERS) {
			if (!robots.groups.some((g) => g.agents.includes(crawler.toLowerCase()))) {
				robotsProblems.push(`ai crawlers: no group for ${crawler}`);
			}
		}
		for (const group of robots.groups) {
			if (group.rules.some((r) => r.field === "disallow" && r.value === "/")) {
				robotsProblems.push(`disallow: "Disallow: /" for ${group.agents.join(", ")}`);
			}
		}
	}
	results.push({ name: "robots.txt", problems: robotsProblems });

	// llms.txt: the llmstxt.org heading and summary, and a link to each docs
	// page's Markdown copy. The copies and llms-full.txt are clean Markdown.
	const llms = read("llms.txt");
	const llmsProblems = llms ? [] : ["llms.txt: missing"];
	if (llms) {
		const lines = llms.split("\n").filter((line) => line.trim());
		if (!lines[0]?.startsWith("# ")) {
			llmsProblems.push("heading: the first line isn't an H1");
		}
		if (!lines.some((line) => line.startsWith("> "))) {
			llmsProblems.push('summary: no "> " line');
		}
		for (const url of sitemap.keys()) {
			const path = url.slice(SITE_URL.length);
			if (path.startsWith("/docs/") && !llms.includes(`(${SITE_URL}/raw${path}.md)`)) {
				llmsProblems.push(`links: no link to ${SITE_URL}/raw${path}.md`);
			}
		}
	}
	results.push({ name: "llms.txt", problems: llmsProblems });

	const markdownFiles = [
		"llms-full.txt",
		...(existsSync(join(dist, "raw"))
			? readdirSync(join(dist, "raw"), { recursive: true, encoding: "utf8" })
					.filter((file) => file.endsWith(".md"))
					.map((file) => join("raw", file))
			: []),
	];
	const markdownProblems = existsSync(join(dist, "llms-full.txt"))
		? []
		: ["llms-full.txt: missing"];
	for (const file of markdownFiles.filter((f) => existsSync(join(dist, f))).sort()) {
		const text = readFileSync(join(dist, file), "utf8");
		const name = relative(dist, join(dist, file)).split(sep).join("/");
		if (/<table[\s>]/i.test(text)) {
			markdownProblems.push(`html table: ${name} has a <table>`);
		}
		if (text.includes("&#x22;")) {
			markdownProblems.push(`mdc residue: ${name} has &#x22;`);
		}
	}
	results.push({ name: "markdown copies", problems: markdownProblems });

	const redirects = read("_redirects");
	results.push({
		name: "_redirects",
		problems:
			redirects === undefined ? [] : redirectProblems(redirects).map((p) => `redirect: ${p}`),
	});

	return results;
}

function main() {
	const dist = process.argv[2] ?? "dist";
	if (!existsSync(join(dist, "index.html"))) {
		console.error(
			`No build in ${dist}. Run WORKERS_CI=1 pnpm --filter @uxfront/docs run generate first.`,
		);
		process.exit(2);
	}

	const results = checkDist(dist);
	let problems = 0;
	for (const { name, problems: found } of results) {
		console.log(`${found.length ? "FAIL" : "ok  "} ${name}`);
		for (const problem of found) {
			console.log(`     ${name}  ${problem}`);
		}
		problems += found.length;
	}
	const pages = results.filter((r) => r.name.startsWith("/")).length;
	console.log(`${pages} pages, ${problems} problems`);
	process.exit(problems ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	main();
}
