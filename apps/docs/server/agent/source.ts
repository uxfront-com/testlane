import { queryCollection } from "@nuxt/content/server";

import { defineAgentContentSource } from "#agent-discovery";
import { MARKDOWN_SOURCES } from "#markdown-sources";

import { toMarkdownCopy } from "../utils/markdown-copy";

// The fields read below. Nitro's types don't see the collections Docus defines.
interface DocsPage {
	path: string;
	title: string;
	description?: string;
	stem: string;
	extension: string;
}

const docs = (event: Parameters<typeof queryCollection>[0]) =>
	queryCollection(event, "docs" as never);

/**
 * The docs pages' Markdown copies, which nuxt-agent-discovery serves at
 * `/raw/<path>.md` and lists in llms.txt and sitemap.md. `agentDiscovery.source`
 * in nuxt.config.ts points here. Each copy is written from the page's source
 * file, not from its parsed body (server/utils/markdown-copy.ts says why). The
 * module adds the frontmatter and the sitemap link around it.
 *
 * It lives outside server/utils/ so that Nitro doesn't make its default export
 * an auto-import.
 */
export default defineAgentContentSource({
	// The site declares no `llms.sections`, so a selector is never this source's.
	async list(selector, event) {
		if (selector) {
			return null;
		}

		const pages = (await docs(event)
			.where("extension", "=", "md")
			.order("stem", "ASC")
			.all()) as Array<DocsPage>;
		return pages.map((page) => ({
			route: page.path,
			title: page.title,
			description: page.description,
		}));
	},

	async get(route, event) {
		const path = route.replace(/\/index$/, "") || "/";
		const page = (await docs(event).path(path).first()) as DocsPage | null;
		const body = page && MARKDOWN_SOURCES[`${page.stem}.${page.extension}`];
		if (!page || body === undefined) {
			return null;
		}

		return {
			title: page.title,
			description: page.description,
			markdown: toMarkdownCopy({
				title: page.title,
				description: page.description,
				body,
				siteUrl: useRuntimeConfig(event).public.siteUrl,
			}),
		};
	},
});
