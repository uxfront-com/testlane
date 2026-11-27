// Lighthouse CI for `pnpm --filter @uxfront/docs lighthouse`: six pages of the static
// build in dist, served by `wrangler dev` the way Cloudflare serves them, three runs
// each. The shared preset fails accessibility and best practices below 0.95 and SEO
// below 1. Performance only warns, since it varies with the runner.
import { lighthouseConfig } from "@uxfront/site-checks/lighthouse";

const ORIGIN = "http://127.0.0.1:8787";

export default lighthouseConfig({
	collect: {
		startServerCommand:
			"WRANGLER_SEND_METRICS=false pnpm dlx wrangler@4 dev --config ../../wrangler.jsonc --ip 127.0.0.1 --port 8787",
		startServerReadyPattern: "Ready on",
		startServerReadyTimeout: 120_000,
		url: [
			`${ORIGIN}/`,
			`${ORIGIN}/docs/getting-started/introduction`,
			`${ORIGIN}/docs/getting-started/quick-start`,
			`${ORIGIN}/docs/guides/review-a-pull-request`,
			`${ORIGIN}/docs/cli/workspace-verbs`,
			`${ORIGIN}/docs/configuration/project-file`,
		],
	},
	categories: { performance: { level: "warn" } },
});
