import { isSiteOrganization } from "~/data/schema";
import { SITE_NAME } from "~/data/site";

/**
 * Drops the `Organization` named Testlane that `useUxHead` writes on the
 * homepage (audit S1). Testlane is software, published by UXFront, which the
 * homepage's own graph says (`homeGraph` in app/data/schema.ts).
 *
 * `useUxHead`'s script has no `key` to replace it by, so this matches the
 * block by what it says: a top-level `Organization` named after the site.
 * @uxfront/layer-ui's next `useUxHead` keeps that block and gives it an
 * `@id`, so the match still holds. The app writes its head through
 * `useUxHead` rather than its own copy, so the layer's other tags keep coming
 * from the layer.
 */
export default defineNuxtPlugin({
	name: "structured-data",
	setup() {
		injectHead().use({
			key: "drop-site-organization",
			hooks: {
				"tags:resolve": (ctx) => {
					ctx.tags = ctx.tags.filter(
						(tag) =>
							!(
								tag.tag === "script" &&
								tag.props.type === "application/ld+json" &&
								isSiteOrganization(tag.innerHTML, SITE_NAME)
							),
					);
				},
			},
		});
	},
});
