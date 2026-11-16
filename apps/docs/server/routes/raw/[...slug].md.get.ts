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
 * Serves `/raw/<path>.md`, each docs page's Markdown copy, which llms.txt
 * links and each page names in its `<link rel="alternate">`. It replaces Nuxt
 * Content's route for the same path, which writes the copy from the parsed
 * page (server/utils/markdown-copy.ts says why). modules/markdown-copies.ts
 * removes Nuxt Content's route.
 */
export default defineEventHandler(async (event) => {
	const slug = getRouterParam(event, "slug.md") ?? "";
	const path = `/${slug.replace(/\.md$/, "")}`.replace(/\/index$/, "") || "/";
	const page = slug.endsWith(".md")
		? ((await queryCollection(event, "docs" as never)
				.path(path)
				.first()) as DocsPage | null)
		: null;
	const body = page && MARKDOWN_SOURCES[`${page.stem}.${page.extension}`];

	if (!page || body === undefined) {
		throw createError({ statusCode: 404, statusMessage: "Page not found" });
	}

	setHeader(event, "Content-Type", "text/markdown; charset=utf-8");
	return toMarkdownCopy({
		title: page.title,
		description: page.description,
		body,
		siteUrl: useRuntimeConfig(event).public.siteUrl,
	});
});
