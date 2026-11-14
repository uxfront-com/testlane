# @uxfront/docs

The Nuxt site for https://testlane.dev: the homepage and the documentation at `/docs`, with every page prerendered. Production is the static build that Cloudflare Workers serves, and the Nitro server build serves the other hosts (see [Deploying](#deploying)). It's built like [uxfront.com](https://github.com/uxfront-com/uxfront/tree/main/apps/web), [opencomponents.dev](https://github.com/uxfront-com/open-components) and [unframework.dev](https://github.com/uxfront-com/unframework/tree/main/apps/web), from the same homepage kit, with the docs on [Docus](https://docus.dev).

## Commands

Run them from the repository root, since the site shares its lockfile with the workspace:

```bash
pnpm install --filter @uxfront/docs
pnpm --filter @uxfront/docs dev         # dev server on http://localhost:3000
pnpm --filter @uxfront/docs test        # the redirects, the homepage's samples and the lanes formation
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

The refs, the project file and the workspace labels the page shows live in `app/data/samples.ts`. `test/samples.test.ts` parses every ref with the CLI's own `parseRef`, so a sample can't promise what `testlane` doesn't do, like a short SHA read as a commit. It also keeps each line of the code samples to 30 characters, which fit the code panel on a 320px phone.

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
- `server/routes/sitemap.xml.ts` replaces Docus's `/sitemap.xml` route, as on unframework.dev. Docus's lists a landing page from `content/index.md`, which this site doesn't have, so it left the homepage out. This one lists `/` first, then the docs pages.
- In content, link to the generated files (`/llms.txt`, `/raw/…`) with `{external}`. Otherwise the router handles the click and shows the 404 page.

### Keeping it accessible

Every page passes axe's contrast rule in light and dark mode, and the homepage and the docs pages we've measured score 1 in Lighthouse accessibility. Docus doesn't as it ships, so the site changes these:

- **Colours.** `app/app.css` darkens Nuxt UI's light-mode primary to the 700 shade, since green's default 500 fails AA contrast on white. `ui.prose.callout` in `app/app.config.ts` draws the callouts' text, links and inline code (`::note`, `::tip`, `::warning`, `::caution`) in the 800 shade in light mode, since Nuxt UI's 600 fails on their tinted background, `::warning`'s yellow worst at 2.75:1.
- **Links.** `ui.prose.a` underlines links at rest, so a link in a sentence doesn't stand out by colour alone.
- **Code.** `nuxt.config.ts` highlights code with the high-contrast GitHub themes, since the default themes put comments below 4.5:1.
- **Three Docus components.** `app/components/docs/DocsPageHeaderLinks.vue` names the button that opens the page menu, which only shows an arrow, and leaves out the menu's MCP items. `app/components/IconMenuToggle.vue` names the button that opens the header's menu on phones, and says whether it's open. `app/pages/[[lang]]/[...slug].vue` makes the separator above "Edit this page" decorative, since a separator can't hold links. The first and last are copies of Docus 5.13.0's, and the toggle draws the same lines, so keep all three in step when you upgrade Docus.

### Old URLs

Until 2.0 the docs lived one level deeper, under a prefix with the CLI's old name. `redirects.ts` sends every old URL to its page with a permanent 301, and `nuxt.config.ts` turns it into route rules: `/docs` and the group roots go to their first page, the old prefix forwards the rest of the URL to `/docs/**`, and the old scripting guide goes to `/docs/guides/script-with-testlane`. `test/redirects.test.ts` checks that every target is a page in `content/docs/`, so moving or renaming a page fails the test until its redirects follow.

## Deploying

The site deploys to Cloudflare Workers through Workers Builds, on the Worker `testlane`. A merge to `main` deploys `testlane.dev`, and every other branch gets a preview of its own.

Workers Builds reads these settings from the Cloudflare dashboard, under the Worker's Settings > Build:

| Setting                      | Value                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Root directory               | `/`                                                                               |
| Build command                | `NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @uxfront/docs run generate` |
| Deploy command               | `npx wrangler deploy`                                                             |
| Non-production branch builds | on, with the default deploy command (`npx wrangler versions upload`)              |
| Build variables              | none                                                                              |
| Custom domain                | `testlane.dev`                                                                    |

Here's how the pieces fit:

- **The build is static.** Workers Builds sets `WORKERS_CI`, and `nuxt.config.ts` then defaults `NITRO_PRESET` to `cloudflare_pages_static`. `nuxt generate` prerenders every page into `apps/docs/dist`, with `_headers`, `_redirects`, `404.html` and the content database dumps that the pages query in the browser. Set `NITRO_PRESET` yourself to build another preset there.
- **`wrangler.jsonc` sits at the repository root**, because the deploy command runs from the root. It serves `apps/docs/dist` as static assets, with no Worker script, and answers unknown paths with the 404 page. Wrangler's `versions upload` stops without its `previews` block, so the block stays, even though it's empty.
- **`modules/workers-redirects.ts` rewrites `_redirects` after the build**, because Nitro writes two rules that Workers handle wrongly. It removes the `/* /404.html 404` rule, which Workers reject, failing the whole upload. It also turns a target like `/docs/uxd/cli/**` into `/docs/uxd/cli/:splat`, since Workers read `**` as part of the path and forward the matched part only through `:splat`. Its test is `test/workers-redirects.test.ts`.

A static site has no server, so one feature of the server build doesn't run on Cloudflare: the layer's redirect from `/` to `/llms.txt` for `curl` and for requests that accept `text/markdown`.

To try the Cloudflare build locally, build it and serve it with Wrangler from the repository root:

```sh
WORKERS_CI=1 NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @uxfront/docs run generate
npx wrangler dev
```

Keep in mind that `wrangler dev` only serves your machine. Never run `wrangler deploy` or `wrangler versions upload` by hand, since each one changes the live Worker.

### Other hosts

Every build without `WORKERS_CI` keeps Nitro's server output, `.output/server/index.mjs`, so these still work:

- **Vercel** builds with `vercel.json`.
- **Docker** builds with `Dockerfile`, from the repository root.
- **Nixpacks** builds with `nixpacks.toml`, from the repository root, with `NIXPACKS_CONFIG_FILE=apps/docs/nixpacks.toml`.

The prerenderer needs more memory than Node's default, so the builds set `NODE_OPTIONS=--max-old-space-size=4096`.

The server needs Node 22.13 or newer, both to build and to run: Docus reads its content with Node's built-in `node:sqlite`, which older versions don't have or keep behind a flag. `engines` in `package.json` says so, which Nixpacks and Vercel read to pick their Node version, and the `Dockerfile` uses `node:22-slim`, which is newer.
