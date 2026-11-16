import { describe, expect, it } from "vitest";
import {
	PUBLISHER_ID,
	SOFTWARE_ID,
	WEBSITE_ID,
	breadcrumbList,
	homeGraph,
	isSiteOrganization,
	techArticle,
} from "../app/data/schema";
import { GROUP_ENTRY_PAGES } from "../redirects";

describe("homeGraph", () => {
	const graph = homeGraph("What Testlane does.")["@graph"] as Record<string, unknown>[];
	const byType = (type: string) => graph.filter((node) => node["@type"] === type);

	it("describes the site, Testlane as software and UXFront as its publisher", () => {
		expect(graph.map((node) => node["@type"])).toEqual(["WebSite", "SoftwareSourceCode", "Organization"]);
		expect(byType("WebSite")[0]).toMatchObject({
			"@id": "https://testlane.dev/#website",
			url: "https://testlane.dev/",
			publisher: { "@id": PUBLISHER_ID },
		});
		expect(byType("SoftwareSourceCode")[0]).toMatchObject({
			"@id": SOFTWARE_ID,
			name: "Testlane",
			codeRepository: "https://github.com/uxfront-com/testlane",
			programmingLanguage: "TypeScript",
			runtimePlatform: "Node.js",
			license: "MIT",
			sameAs: ["https://github.com/uxfront-com/testlane", "https://www.npmjs.com/package/@uxfront/testlane"],
		});
		expect(byType("Organization")).toEqual([
			{ "@type": "Organization", "@id": "https://testlane.dev/#publisher", name: "UXFront", url: "https://uxfront.com" },
		]);
	});

	it("calls no node named Testlane an Organization", () => {
		expect(graph.some((node) => node["@type"] === "Organization" && node.name === "Testlane")).toBe(false);
	});
});

describe("techArticle", () => {
	it("describes a docs page, with its date and image, in the site's graph", () => {
		expect(
			techArticle({
				headline: "CLI Exit Codes",
				description: "Every exit code.",
				path: "/docs/cli/exit-codes",
				dateModified: "2026-11-16",
				image: "/_og/s/o_abc.png",
			}),
		).toMatchObject({
			"@type": "TechArticle",
			headline: "CLI Exit Codes",
			url: "https://testlane.dev/docs/cli/exit-codes",
			dateModified: "2026-11-16",
			image: "https://testlane.dev/_og/s/o_abc.png",
			inLanguage: "en",
			isPartOf: { "@id": WEBSITE_ID },
			publisher: { "@id": PUBLISHER_ID, name: "UXFront" },
		});
	});

	it("leaves out a date or image it doesn't have", () => {
		const article = techArticle({ headline: "A", description: "B", path: "/docs/a" });
		expect(article).not.toHaveProperty("dateModified");
		expect(article).not.toHaveProperty("image");
	});
});

describe("breadcrumbList", () => {
	it("points a sidebar group at its first page, since the group's own path redirects", () => {
		const list = breadcrumbList([
			{ title: "CLI Reference", path: "/docs/cli" },
			{ title: "Exit Codes", path: "/docs/cli/exit-codes" },
		]);
		expect(list.itemListElement).toEqual([
			{ "@type": "ListItem", position: 1, name: "CLI Reference", item: "https://testlane.dev/docs/cli/overview" },
			{ "@type": "ListItem", position: 2, name: "Exit Codes", item: "https://testlane.dev/docs/cli/exit-codes" },
		]);
	});

	it.each(Object.entries(GROUP_ENTRY_PAGES))("points the %s group at /docs/%s/%s", (group, page) => {
		expect(breadcrumbList([{ title: group, path: `/docs/${group}` }]).itemListElement[0]?.item).toBe(
			`https://testlane.dev/docs/${group}/${page}`,
		);
	});
});

describe("isSiteOrganization", () => {
	it("matches useUxHead's Organization named after the site, with or without an @id", () => {
		expect(isSiteOrganization('{"@context":"https://schema.org","@type":"Organization","name":"Testlane","url":"https://testlane.dev/"}', "Testlane")).toBe(true);
		expect(isSiteOrganization('{"@type":"Organization","@id":"https://testlane.dev/#organization","name":"Testlane"}', "Testlane")).toBe(true);
	});

	it("keeps every other block", () => {
		expect(isSiteOrganization('{"@type":"Organization","name":"UXFront"}', "Testlane")).toBe(false);
		expect(isSiteOrganization(JSON.stringify(homeGraph("x")), "Testlane")).toBe(false);
		expect(isSiteOrganization('{"@type":"SoftwareSourceCode","name":"Testlane"}', "Testlane")).toBe(false);
		expect(isSiteOrganization("not json", "Testlane")).toBe(false);
		expect(isSiteOrganization("null", "Testlane")).toBe(false);
		expect(isSiteOrganization(undefined, "Testlane")).toBe(false);
	});
});
