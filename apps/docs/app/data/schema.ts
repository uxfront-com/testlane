import { REDIRECTS } from "../../redirects";
import { GITHUB_URL, NPM_URL, SITE_NAME, SITE_URL, UXFRONT_URL } from "./site";

/**
 * The schema.org structured data the site describes itself with (audit S1 to
 * S3): testlane.dev is a `WebSite`, Testlane is the `SoftwareSourceCode` it's
 * about, and UXFront is the `Organization` that publishes both. Each node has
 * an `@id`, so the docs pages point at the same site and publisher.
 */

export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;
export const PUBLISHER_ID = `${SITE_URL}/#publisher`;

const publisher = {
	"@type": "Organization",
	"@id": PUBLISHER_ID,
	name: "UXFront",
	url: UXFRONT_URL,
};

const website = {
	"@type": "WebSite",
	"@id": WEBSITE_ID,
	name: SITE_NAME,
	url: `${SITE_URL}/`,
	inLanguage: "en",
};

/** The homepage's one `@graph`: the site, the software and its publisher. */
export function homeGraph(description: string) {
	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				...website,
				description,
				publisher: { "@id": PUBLISHER_ID },
				about: { "@id": SOFTWARE_ID },
			},
			{
				"@type": "SoftwareSourceCode",
				"@id": SOFTWARE_ID,
				name: SITE_NAME,
				description,
				url: `${SITE_URL}/`,
				codeRepository: GITHUB_URL,
				programmingLanguage: "TypeScript",
				runtimePlatform: "Node.js",
				license: "MIT",
				sameAs: [GITHUB_URL, NPM_URL],
				author: { "@id": PUBLISHER_ID },
				publisher: { "@id": PUBLISHER_ID },
			},
			publisher,
		],
	};
}

export interface DocsArticle {
	/** The page's title, as its `<title>` has it without the template. */
	headline: string;
	description: string;
	/** The page's path, like `/docs/cli/exit-codes`. */
	path: string;
	/** `YYYY-MM-DD`, left out when the build has no date for the page. */
	dateModified?: string;
	/** The page's Open Graph image, absolute or from the site's root. */
	image?: string;
}

/**
 * A docs page as a `TechArticle`, in place of Docus's `Article`, whose
 * publisher is an Organization named after the site (S2). The site and its
 * publisher are written out with their `@id`s, so the page reads on its own
 * and still joins the homepage's graph.
 */
export function techArticle({ headline, description, path, dateModified, image }: DocsArticle) {
	const url = absolute(path);
	return {
		"@context": "https://schema.org",
		"@type": "TechArticle",
		headline,
		description,
		url,
		mainEntityOfPage: url,
		...(dateModified && { dateModified }),
		...(image && { image: absolute(image) }),
		inLanguage: "en",
		isPartOf: website,
		author: publisher,
		publisher,
	};
}

export interface Crumb {
	title: string;
	path: string;
}

/**
 * A `BreadcrumbList` whose every item is a page in the sitemap. A path that
 * only redirects, like a sidebar group's `/docs/cli`, points at the page it
 * opens instead, its first page in `GROUP_ENTRY_PAGES` (S3).
 */
export function breadcrumbList(crumbs: Array<Crumb>) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: crumbs.map((crumb, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: crumb.title,
			item: absolute(REDIRECTS[crumb.path] ?? crumb.path),
		})),
	};
}

function absolute(path: string) {
	return /^https?:\/\//.test(path) ? path : `${SITE_URL}${path}`;
}

/**
 * Whether a JSON-LD block is a lone `Organization` named after the site, the
 * block `useUxHead` writes, which calls the software an organization (S1).
 */
export function isSiteOrganization(json: string | undefined, siteName: string) {
	if (!json) {
		return false;
	}

	try {
		const node = JSON.parse(json) as Record<string, unknown> | null;
		return node?.["@type"] === "Organization" && node.name === siteName;
	} catch {
		return false;
	}
}
