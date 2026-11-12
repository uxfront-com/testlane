# Testlane docs

This is the documentation site for Testlane, served at [testlane.dev](https://testlane.dev). It's a Nuxt app that extends `@uxfront/layer-docs`, with its pages in `content/`.

## Develop

Run these from the repository root, since the workspace has one lockfile there:

```sh
pnpm install
pnpm --filter @uxfront/docs run dev
pnpm --filter @uxfront/docs run test
```

## Deploying

The site deploys to Cloudflare Workers through Workers Builds, on the Worker `testlane`. A merge to `main` deploys `testlane.dev`, and every other branch gets a preview of its own.

Workers Builds reads these settings from the Cloudflare dashboard, under the Worker's Settings > Build:

| Setting                      | Value                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Root directory               | `/`                                                                               |
| Build command                | `NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @uxfront/docs run generate` |
| Deploy command               | `npx wrangler deploy`                                                             |
| Non-production branch builds | on, with the deploy command `npx wrangler preview`                                |
| Build variables              | none                                                                              |
| Custom domain                | `testlane.dev`                                                                    |

Here's how the pieces fit:

- **The build is static.** Workers Builds sets `WORKERS_CI`, and `nuxt.config.ts` then defaults `NITRO_PRESET` to `cloudflare_pages_static`. `nuxt generate` prerenders every page into `apps/docs/dist`, with `_headers`, `_redirects`, `404.html` and the content database dumps that the pages query in the browser. Set `NITRO_PRESET` yourself to build another preset there.
- **`wrangler.jsonc` sits at the repository root**, because the deploy command runs from the root. It serves `apps/docs/dist` as static assets, with no Worker script, and answers unknown paths with the 404 page. `wrangler preview` stops without its `previews` block, so the block stays, even though it's empty.
- **`modules/workers-redirects.ts` rewrites `_redirects` after the build**, because Nitro writes two rules that Workers handle wrongly. It removes the `/* /404.html 404` rule, which Workers reject, failing the whole upload. It also turns a target like `/docs/uxd/cli/**` into `/docs/uxd/cli/:splat`, since Workers read `**` as part of the path and forward the matched part only through `:splat`. Its test is `test/workers-redirects.test.ts`.

A static site has no server, so one feature of the server build doesn't run on Cloudflare: the layer's redirect from `/` to `/llms.txt` for `curl` and for requests that accept `text/markdown`.

To try the Cloudflare build locally, build it and serve it with Wrangler from the repository root:

```sh
WORKERS_CI=1 NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @uxfront/docs run generate
npx wrangler dev
```

Keep in mind that `wrangler dev` only serves your machine. Never run `wrangler deploy` or `wrangler preview` by hand, since each one uploads to the live Worker.

### Other hosts

Every build without `WORKERS_CI` keeps Nitro's server output, `.output/server/index.mjs`, so these still work:

- **Vercel** builds with `vercel.json`.
- **Docker** builds with `Dockerfile`, from the repository root.
- **Nixpacks** builds with `nixpacks.toml`, from the repository root, with `NIXPACKS_CONFIG_FILE=apps/docs/nixpacks.toml`.
