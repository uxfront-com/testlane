import { defineNuxtModule } from "@nuxt/kit";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Turns the `_redirects` file that Nitro writes into one that Workers accept.
 *
 * - It removes every rule that answers with a 404. Nitro ends the file with
 *   `/* /404.html 404`, and Workers static assets reject that rule, which fails
 *   the whole upload. `not_found_handling` in `wrangler.jsonc` serves the 404
 *   page instead.
 * - It rewrites a target that ends in `/**` to end in `/:splat`. Nitro copies
 *   the `**` of a `routeRules` redirect into the target, but Workers read it as
 *   a literal path, and forward the matched part only through `:splat`.
 *
 * Every other line stays as it is, in order.
 */
export function toWorkersRedirects(redirects: string): string {
	return redirects
		.split("\n")
		.filter((line) => line.trim().split(/\s+/)[2] !== "404")
		.map((line) => {
			const [source, target, ...rest] = line.trim().split(/\s+/);
			if (!target?.endsWith("/**")) {
				return line;
			}

			return [source, `${target.slice(0, -"**".length)}:splat`, ...rest].join(
				"\t",
			);
		})
		.join("\n");
}

/**
 * Rewrites `<output>/_redirects` with `toWorkersRedirects` after a build with a
 * Cloudflare preset, which Workers Builds choose in `nuxt.config.ts`. Other
 * presets write no `_redirects`, so this does nothing for them.
 */
export default defineNuxtModule({
	meta: { name: "workers-redirects" },
	setup(_options, nuxt) {
		nuxt.hook("nitro:init", (nitro) => {
			if (nitro.options.dev || !nitro.options.preset.includes("cloudflare")) {
				return;
			}

			// Registered after the preset's own `compiled` hook, which writes the file.
			nitro.hooks.hook("compiled", async () => {
				const file = join(nitro.options.output.dir, "_redirects");
				if (!existsSync(file)) {
					return;
				}

				const redirects = await readFile(file, "utf8");
				await writeFile(file, toWorkersRedirects(redirects), "utf8");
			});
		});
	},
});
