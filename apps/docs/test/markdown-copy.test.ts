import { describe, expect, it } from "vitest";
import { absoluteLinks, stripFrontmatter, toMarkdownCopy } from "../server/utils/markdown-copy";

const SITE = "https://testlane.dev";

describe("stripFrontmatter", () => {
	it("removes the YAML frontmatter and keeps the body", () => {
		expect(stripFrontmatter("---\ntitle: A\nseo:\n  title: B\n---\n\nBody\n")).toBe("\nBody\n");
	});

	it("handles CRLF line ends and a byte order mark", () => {
		expect(stripFrontmatter("﻿---\r\ntitle: A\r\n---\r\nBody")).toBe("Body");
	});

	it("leaves a file without frontmatter, or a later rule, alone", () => {
		expect(stripFrontmatter("Body\n\n---\n\nMore")).toBe("Body\n\n---\n\nMore");
		expect(stripFrontmatter("")).toBe("");
	});
});

describe("absoluteLinks", () => {
	it("makes root-relative links and images absolute", () => {
		expect(absoluteLinks("See [Refs](/docs/concepts/refs) and ![x](/og.jpg).", SITE)).toBe(
			"See [Refs](https://testlane.dev/docs/concepts/refs) and ![x](https://testlane.dev/og.jpg).",
		);
	});

	it("leaves absolute, protocol-relative and relative links alone", () => {
		const text = "[a](https://x.dev/) [b](//cdn.dev/x) [c](#faq) [d](./e)";
		expect(absoluteLinks(text, SITE)).toBe(text);
	});

	it("leaves code blocks alone", () => {
		const text = ["```md", "[a](/docs)", "```", "[b](/docs)", "~~~", "```", "[c](/docs)", "~~~"].join("\n");
		expect(absoluteLinks(text, SITE)).toBe(
			["```md", "[a](/docs)", "```", "[b](https://testlane.dev/docs)", "~~~", "```", "[c](/docs)", "~~~"].join("\n"),
		);
	});
});

describe("toMarkdownCopy", () => {
	it("writes the title as an H1, the description as a quote, then the body", () => {
		expect(
			toMarkdownCopy({
				title: "Exit Codes",
				description: "Every exit code.",
				body: "\n| Code | Name |\n| --- | --- |\n| `0` | None |\n\nSee [Troubleshooting](/docs/guides/troubleshooting).\n",
				siteUrl: SITE,
			}),
		).toBe(
			[
				"# Exit Codes",
				"",
				"> Every exit code.",
				"",
				"| Code | Name |",
				"| --- | --- |",
				"| `0` | None |",
				"",
				"See [Troubleshooting](https://testlane.dev/docs/guides/troubleshooting).",
				"",
			].join("\n"),
		);
	});

	it("keeps MDC blocks as text and adds no HTML", () => {
		const copy = toMarkdownCopy({
			title: "Install",
			body: '::steps{level="3"}\n### Install\n::',
			siteUrl: SITE,
		});
		expect(copy).toBe('# Install\n\n::steps{level="3"}\n### Install\n::\n');
		expect(copy).not.toMatch(/<table|&#x22;/);
	});

	it("keeps a body's own H1", () => {
		expect(toMarkdownCopy({ title: "A", description: "B", body: "# Own\n\nText", siteUrl: SITE })).toBe("# Own\n\nText\n");
	});
});
