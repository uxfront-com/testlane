import { queryCollection } from "@nuxt/content/server";
import { MARKDOWN_SOURCES } from "#markdown-sources";

// The fields read below. Nitro's types don't see the collections Docus defines.
interface DocsPage {
	title: string;
	description?: string;
	stem: string;
	extension: string;
}

/**
 * Serves `/llms-full.txt`, every docs page's Markdown copy in sidebar order,
 * the same copies `/raw/<path>.md` serves. It replaces nuxt-llms's route,
 * whose copies Nuxt Content writes from the parsed pages
 * (server/utils/markdown-copy.ts says why), and which
 * modules/markdown-copies.ts removes. llms.txt still links it.
 */
export default defineEventHandler(async (event) => {
	const pages = (await queryCollection(event, "docs" as never)
		.where("extension", "=", "md")
		.order("stem", "ASC")
		.all()) as Array<DocsPage>;
	const { siteUrl } = useRuntimeConfig(event).public;

	setHeader(event, "Content-Type", "text/plain; charset=utf-8");
	return pages
		.map((page) =>
			toMarkdownCopy({
				title: page.title,
				description: page.description,
				body: MARKDOWN_SOURCES[`${page.stem}.${page.extension}`] ?? "",
				siteUrl,
			}),
		)
		.join("\n");
});
