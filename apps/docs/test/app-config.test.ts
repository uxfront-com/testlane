import { beforeAll, describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "../app/data/site";

type AppConfig = {
	github: { url: string };
	docsTheme: { headerLinks: Array<{ label: string; to: string }> };
};

let config: AppConfig;

beforeAll(async () => {
	// Nuxt auto-imports defineAppConfig, which returns the config as it is.
	vi.stubGlobal("defineAppConfig", (value: AppConfig) => value);
	config = (await import("../app/app.config")).default;
});

describe("the docs header", () => {
	// Docus renders an icon button for github.url among the header's buttons,
	// and "Edit this page" and "Report an issue" read it too.
	it("links to GitHub through Docus's icon button", () => {
		expect(config.github.url).toBe(GITHUB_URL);
	});

	// A GitHub entry in headerLinks would show GitHub a second time, as a text
	// link with an external icon.
	it("has no GitHub link among its header links", () => {
		const links = config.docsTheme.headerLinks;
		expect(links.some((link) => link.to.startsWith(GITHUB_URL))).toBe(false);
	});

	// Spelled out, as the homepage header writes it.
	it("names its link to the docs Documentation", () => {
		expect(config.docsTheme.headerLinks.map((link) => link.label)).toEqual(["Documentation"]);
	});
});
