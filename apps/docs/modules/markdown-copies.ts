import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { addServerTemplate, addTypeTemplate, defineNuxtModule } from "@nuxt/kit";

import { stripFrontmatter } from "../server/utils/markdown-copy";

/**
 * Gives server code the source of every Markdown page in `content/`, without
 * its frontmatter, as `MARKDOWN_SOURCES` from `#markdown-sources`, keyed by
 * its path in `content/` (a page's `stem` and `extension`, like
 * `docs/4.cli/6.exit-codes.md`). `server/routes/raw/[...slug].md.get.ts` and
 * `server/routes/llms-full.txt.get.ts` serve the pages' Markdown copies from
 * it, so they need no file system where the server runs.
 *
 * Those two routes replace Nuxt Content's `/raw/**:slug.md` and nuxt-llms's
 * `/llms-full.txt`, which write the copies from the parsed pages. Both
 * modules register theirs for GET too, and the router keeps the last route
 * registered for a path and method, so this removes theirs.
 */
export const REPLACED_ROUTES = ["/raw/**:slug.md", "/llms-full.txt"];

export default defineNuxtModule({
	meta: { name: "markdown-copies" },
	setup(_options, nuxt) {
		const contentDir = join(nuxt.options.rootDir, "content");
		const getContents = () => {
			const sources = Object.fromEntries(
				readdirSync(contentDir, { recursive: true, encoding: "utf8" })
					.filter((file) => file.endsWith(".md"))
					.sort()
					.map((file) => [
						file.split("\\").join("/"),
						stripFrontmatter(readFileSync(join(contentDir, file), "utf8")),
					]),
			);
			return `export const MARKDOWN_SOURCES = ${JSON.stringify(sources)};\n`;
		};

		addServerTemplate({ filename: "#markdown-sources", getContents });
		nuxt.hook("nitro:config", (config) => {
			config.handlers = config.handlers?.filter(
				(handler) => !REPLACED_ROUTES.includes(handler.route ?? ""),
			);
		});
		addTypeTemplate(
			{
				filename: "types/markdown-sources.d.ts",
				getContents: () =>
					[
						'declare module "#markdown-sources" {',
						"\t/** Each Markdown page's source without its frontmatter, by its path in content/. */",
						"\texport const MARKDOWN_SOURCES: Record<string, string>;",
						"}",
						"",
					].join("\n"),
			},
			{ nuxt: false, nitro: true },
		);
	},
});
