# @uxfront/docs

The Nuxt site for https://testlane.uxfront.com: the homepage and the documentation at `/docs`, prerendered and served by a Nitro server. It's built like [uxfront.com](https://github.com/uxfront-com/uxfront/tree/main/apps/web), [opencomponents.dev](https://github.com/uxfront-com/open-components) and [unframework.dev](https://github.com/uxfront-com/unframework/tree/main/apps/web), from the same homepage kit, with the docs on [Docus](https://docus.dev).

## Commands

Run them from the repository root, since the site shares its lockfile with the workspace:

```bash
pnpm install --filter @uxfront/docs
pnpm --filter @uxfront/docs dev         # dev server on http://localhost:3000
pnpm --filter @uxfront/docs test        # the redirect map against content/docs
pnpm --filter @uxfront/docs build       # nuxt build → .output, every page prerendered into .output/public
pnpm --filter @uxfront/docs lighthouse  # Lighthouse CI against .output/public, fails below 0.95 in any category
```

The build prerenders by crawling links from `/` and the introduction, and fails on any page that doesn't render, so a broken link or a renamed page fails it too.

## The homepage

The page (`app/pages/index.vue`) holds the copy and the scene. Its story follows `lanes`, a formation of this site's own: one stream of white light (the repository) that four refs branch off, each into a lane of its own that ends in a lit workspace with its port.

| Section         | Formation                                                                               | Copy                                                  |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Hero            | `lanes`, held with all four workspaces lit, a ref and its port beside each              | What Testlane does                                    |
| 01 Pipeline     | `lanes` seen from the left, beside the copy                                             | The three steps every command takes                   |
| 02 Refs         | `outline`: the particles gather around the code panel                                   | The kinds of ref you can point at                     |
| 03 Isolation    | Close-up on the workspaces, the lanes faint behind the copy, a ref and port on each     | Why workspaces don't collide                          |
| 04 Environment  | `outline`, around the project file                                                      | What Testlane tells your commands                     |
| 05 Lifecycle    | `lanes` from below, dimmed behind the six details                                       | From opening a workspace to cleaning it up            |
| 06 Requirements | Close-up on the repository's stream, the rest dimmed                                    | What Testlane needs                                   |
| Finale          | The light corridor                                                                      | The docs, the CLI reference, GitHub and the other UXFront projects |

The chapters wrap `lanes` in two ways: `hold()` from `@uxfront/scene` keeps it at a fixed progress (the lanes branch off one after another as a chapter is read, so held, all four stay lit while the page starts to scroll), and `spotlight()` in `app/lib/formations/spotlight.ts` lights one stretch of it along the x axis.

`lanes` lives in `app/lib/formations/`:

- `lanes.ts` describes it with `defineFormation()`: its framings for desktop and mobile, and its anchors, `lanes:0` to `lanes:3`, at each workspace's port, top to bottom. The page pins a ref and its port there.
- `lanes.shader.ts` is its GLSL, which the scene imports once the page is idle, so it's a chunk of its own that the homepage never preloads. It needs no `setup()` or `update()`, so nothing reads the page's layout while it draws.
- `lanes.geometry.ts` holds the shape both of them use, so the labels sit where the workspaces are drawn. Keep the GLSL in step with it.

Everything else comes from the homepage kit:

- [`@uxfront/layer-ui`](https://www.npmjs.com/package/@uxfront/layer-ui), extended in `nuxt.config.ts`: auto-imports the components, self-hosts the fonts, adds `useUxHead()` and keeps the critical path clean.
- [`@uxfront/ui`](https://www.npmjs.com/package/@uxfront/ui): the Vue components (`UxSite`, `UxHero`, `UxChapter`, `UxSplit`, `UxFinale`, the HUD, the header and the labels pinned to the formations) and the design tokens.
- [`@uxfront/scene`](https://www.npmjs.com/package/@uxfront/scene): the WebGL particle scene and the `outline` and `corridor` formations. Without WebGL2, the page shows the scene's fallback with all of its copy.

`public/og.jpg` is a 1200 × 630 capture of the hero, with the HUD and the scroll cue hidden. Capture it again when the hero changes. The favicons in `public/` draw the same lanes.

## The docs

The documentation is built with Docus, through [`@uxfront/layer-docs`](https://www.npmjs.com/package/@uxfront/layer-docs), the second layer in `nuxt.config.ts`. Pages are markdown files in `content/docs/`, served under `/docs`. Number files and folders to order them in the sidebar, as in `1.getting-started/1.introduction.md`, which is served at `/docs/getting-started/introduction`. From those files, Docus builds the sidebar, search, table of contents, a markdown copy of each page at `/raw/<path>.md`, `llms.txt`, `llms-full.txt`, `sitemap.xml` and each page's Open Graph image.

How it shares the app with the homepage:

- `app/app.vue` replaces Docus's own, so it renders the Docus shell (header, sidebar, search), loaded lazily, on `/docs` and below, and the bare page everywhere else. `app/error.vue` renders `UxErrorPage`, docs included.
- `docsTheme.byline` in `app/app.config.ts` signs the docs header's "Testlane" "by UXFront", like the homepage header, and `docsTheme.headerLinks` adds the Docs and GitHub links.
- Docus adds Tailwind CSS and Nuxt UI to the entry stylesheet. On the homepage, `@uxfront/layer-ui` loads that stylesheet after first paint, and the `.ux-site` styles take precedence over it. Keep `app/app.css`, which Docus imports into the same stylesheet, off `.ux-site` too.
- `app/app.config.ts` sets the theme colours and the GitHub, "Edit this page" and "Report an issue" links, with `rootDir: "apps/docs"`, since the docs don't live at the repository root.
- Docus reads the site URL from `NUXT_SITE_URL`, which `nuxt.config.ts` defaults to the production origin.
- Docus's MCP server is off (`mcp.enabled` in `nuxt.config.ts`), and so is its AI assistant, which only starts with an `AI_GATEWAY_API_KEY`.
- In content, link to the generated files (`/llms.txt`, `/raw/…`) with `{external}`. Otherwise the router handles the click and shows the 404 page.

### Keeping it accessible

Every page passes axe's contrast rule in light and dark mode, and the homepage and the docs pages we've measured score 1 in Lighthouse accessibility. Docus doesn't as it ships, so the site changes four things:

- **Colours.** `app/app.css` darkens Nuxt UI's light-mode primary to the 700 shade, since green's default 500 fails AA contrast on white. `ui.prose.callout` in `app/app.config.ts` draws the callouts' text, links and inline code (`::note`, `::tip`, `::warning`, `::caution`) in the 800 shade in light mode, since Nuxt UI's 600 fails on their tinted background, `::warning`'s yellow worst at 2.75:1.
- **Links.** `ui.prose.a` underlines links at rest, so a link in a sentence doesn't stand out by colour alone.
- **Code.** `nuxt.config.ts` highlights code with the high-contrast GitHub themes, since the default themes put comments below 4.5:1.
- **Two Docus components.** `app/components/docs/DocsPageHeaderLinks.vue` names the button that opens the page menu, which only shows an arrow, and leaves out the menu's MCP items. `app/pages/[[lang]]/[...slug].vue` makes the separator above "Edit this page" decorative, since a separator can't hold links. Both are copies of Docus 5.13.0's, so keep them in step when you upgrade it.

### Old URLs

Until 2.0 the docs lived one level deeper, under a prefix with the CLI's old name. `redirects.ts` sends every old URL to its page with a permanent 301, and `nuxt.config.ts` turns it into route rules: `/docs` and the group roots go to their first page, the old prefix forwards the rest of the URL to `/docs/**`, and the old scripting guide goes to `/docs/guides/script-with-testlane`. `test/redirects.test.ts` checks that every target is a page in `content/docs/`, so moving or renaming a page fails the test until its redirects follow.

## Deploying

The site runs as a Nitro server (`node .output/server/index.mjs`), which serves the prerendered pages from `.output/public` and answers the redirects. Three setups build it from the repository root, each with `pnpm install --frozen-lockfile --filter @uxfront/docs` and `pnpm --filter @uxfront/docs run build`:

- `Dockerfile`, for Dokploy or any Docker host, listening on port 3000.
- `nixpacks.toml`, for Nixpacks builders like Dokploy or Railway (`NIXPACKS_CONFIG_FILE=apps/docs/nixpacks.toml`).
- `vercel.json`, for Vercel, with `apps/docs` as the root directory.

The prerenderer needs more memory than Node's default, so the builds set `NODE_OPTIONS=--max-old-space-size=4096`.
