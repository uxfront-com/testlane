/**
 * The Markdown copy of a docs page that `/raw/<path>.md` serves and
 * `llms-full.txt` joins, written from the page's source rather than from its
 * parsed body (audit A2). Nuxt Content's own copy stringifies the parsed body,
 * which writes tables as HTML `<table>` blocks and leaves MDC attribute residue
 * like `{rel="&#x22;nofollow&#x22;"}`. The source is Markdown already: its
 * tables stay tables, and its MDC blocks, like `::steps`, read as plain text.
 */

export interface MarkdownCopyInput {
	title: string;
	description?: string;
	/** The source file's Markdown, without its frontmatter. */
	body: string;
	/** The origin root-relative links resolve against, like `https://testlane.dev`. */
	siteUrl: string;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/;
const FENCE = /^\s*(`{3,}|~{3,})/;

/** A source file's Markdown without its YAML frontmatter. */
export function stripFrontmatter(source: string) {
	return source.replace(/^\uFEFF/, "").replace(FRONTMATTER, "");
}

/**
 * Rewrites each root-relative Markdown link or image, `](/docs/…)`, to an
 * absolute URL, so a copy read on its own, out of the site, still links home.
 * Code blocks are left as they are.
 */
export function absoluteLinks(markdown: string, siteUrl: string) {
	let fence: string | undefined;
	return markdown
		.split("\n")
		.map((line) => {
			const marker = line.match(FENCE)?.[1];
			if (marker && (!fence || marker[0] === fence[0] && marker.length >= fence.length)) {
				fence = fence ? undefined : marker;
				return line;
			}
			return fence ? line : line.replaceAll(/\]\(\/(?!\/)/g, `](${siteUrl}/`);
		})
		.join("\n");
}

/** The page as Markdown: its title as an H1, its description as a quote, then its body. */
export function toMarkdownCopy({ title, description, body, siteUrl }: MarkdownCopyInput) {
	const content = absoluteLinks(body.trim(), siteUrl);
	if (/^#\s/.test(content)) {
		return `${content}\n`;
	}

	return [`# ${title}`, ...(description ? [`> ${description}`] : []), content]
		.filter(Boolean)
		.join("\n\n")
		.concat("\n");
}
