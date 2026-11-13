import { describe, expect, it } from "vitest";
import { SITE_URL } from "../app/data/site";

describe("SITE_URL", () => {
	// It becomes NUXT_SITE_URL and runtimeConfig.public.siteUrl, so it names the
	// host in every canonical link, og:url, sitemap, robots.txt and llms.txt.
	it("is the production origin, the custom domain of the Workers deploy", () => {
		expect(SITE_URL).toBe("https://testlane.dev");
	});

	// The sitemap joins it with paths that start with "/".
	it("is a bare origin, with no path or trailing slash", () => {
		expect(new URL(SITE_URL).origin).toBe(SITE_URL);
	});
});
