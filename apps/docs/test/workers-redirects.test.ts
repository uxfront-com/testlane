import { describe, expect, it } from "vitest";
import { toWorkersRedirects } from "../modules/workers-redirects";

describe("toWorkersRedirects", () => {
	it("removes the 404 rule that Workers reject", () => {
		expect(
			toWorkersRedirects(
				"/docs\t/docs/uxd/getting-started/introduction\t307\n/* /404.html 404",
			),
		).toBe("/docs\t/docs/uxd/getting-started/introduction\t307");
	});

	it("rewrites a target that ends in /** to /:splat", () => {
		expect(toWorkersRedirects("/docs/cli/*\t/docs/uxd/cli/**\t307")).toBe(
			"/docs/cli/*\t/docs/uxd/cli/:splat\t307",
		);
	});

	it("keeps the other rules as they are, in order", () => {
		const rules = [
			"/docs/uxd/cli\t/docs/uxd/cli/overview\t307",
			"/docs/cli\t/docs/uxd/cli/overview\t307",
			"/docs/guides/*\t/docs/uxd/guides/**\t307",
			"/docs\t/docs/uxd/getting-started/introduction\t307",
			"/* /404.html 404",
			"",
		].join("\n");

		expect(toWorkersRedirects(rules)).toBe(
			[
				"/docs/uxd/cli\t/docs/uxd/cli/overview\t307",
				"/docs/cli\t/docs/uxd/cli/overview\t307",
				"/docs/guides/*\t/docs/uxd/guides/:splat\t307",
				"/docs\t/docs/uxd/getting-started/introduction\t307",
				"",
			].join("\n"),
		);
	});

	it("leaves an empty file empty", () => {
		expect(toWorkersRedirects("")).toBe("");
	});
});
