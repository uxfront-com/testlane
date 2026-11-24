import { addServerTemplate, addTemplate, addTypeTemplate, defineNuxtModule, useLogger } from "@nuxt/kit";
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

/** Runs git in a directory and returns what it printed, trimmed. */
export type Git = (args: Array<string>) => Promise<string>;

/** The source file of the homepage, whose date is the date of `/`. */
export const HOMEPAGE_SOURCE = "app/pages/index.vue";

/** What `readGitDates` found: a date per file, or why there are none. */
export type GitDates =
	| { dates: Record<string, string>; undated: Array<string> }
	| { error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The date of the last commit that changed each file, as `YYYY-MM-DD`, from
 * `git log -1 --format=%cs -- <file>`. A shallow clone would give the date of
 * its oldest commit to every file it doesn't reach, so it fetches the rest of
 * the history first, and gives no dates at all if it can't. A file with no
 * commit, like a new one not yet committed, is listed in `undated`.
 */
export async function readGitDates(files: Array<string>, git: Git): Promise<GitDates> {
	let shallow: string;
	try {
		shallow = await git(["rev-parse", "--is-shallow-repository"]);
	} catch (error) {
		return { error: `git can't read the history here: ${message(error)}` };
	}

	if (shallow === "true") {
		try {
			await git(["fetch", "--unshallow", "--quiet"]);
		} catch (error) {
			return {
				error: `the clone is shallow and \`git fetch --unshallow\` failed: ${message(error)}`,
			};
		}
	}

	const dates: Record<string, string> = {};
	const undated: Array<string> = [];
	try {
		await Promise.all(
			files.map(async (file) => {
				const date = await git(["log", "-1", "--format=%cs", "--", file]);
				if (DATE.test(date)) {
					dates[file] = date;
				} else {
					undated.push(file);
				}
			}),
		);
	} catch (error) {
		return { error: `git log failed: ${message(error)}` };
	}

	return { dates, undated: undated.sort() };
}

/** What git said, or the error's own first line when it said nothing. */
function message(error: unknown) {
	const stderr = (error as { stderr?: unknown } | null)?.stderr;
	const text = (typeof stderr === "string" && stderr.trim()) || (error instanceof Error ? error.message : String(error));
	return text.trim().split("\n")[0] ?? text;
}

/** Every Markdown file in `content/`, as a path from the app's root. */
function contentFiles(rootDir: string) {
	return readdirSync(join(rootDir, "content"), { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".md"))
		.map((file) => join("content", file).split("\\").join("/"))
		.sort();
}

/**
 * The date each page last changed, for the sitemap's `<lastmod>` and the docs
 * pages' `dateModified`: the last commit of its source file, from
 * `readGitDates`. App code imports the map from `#build/git-dates.mjs` and
 * server code from `#git-dates`, keyed by the file's path from the app's root,
 * like `content/docs/4.cli/6.exit-codes.md` and `app/pages/index.vue`.
 *
 * A build that can't read the history, like one in the Dockerfile's image,
 * which has no git, leaves the dates out and warns. The static build that
 * Workers Builds deploys to testlane.dev (WORKERS_CI) fails instead, since a
 * sitemap without dates is a production regression. `nuxt prepare` reads no
 * dates.
 */
export default defineNuxtModule({
	meta: { name: "git-dates" },
	async setup(_options, nuxt) {
		const logger = useLogger("git-dates");
		let dates: Record<string, string> = {};

		if (!nuxt.options._prepare) {
			const files = [HOMEPAGE_SOURCE, ...contentFiles(nuxt.options.rootDir)];
			const run = promisify(execFile);
			const git: Git = async (args) =>
				(await run("git", args, { cwd: nuxt.options.rootDir })).stdout.trim();
			const found = await readGitDates(files, git);
			const production = Boolean(process.env.WORKERS_CI);
			const problem =
				"error" in found
					? found.error
					: found.undated.length
						? `no commit changed ${found.undated.join(", ")}`
						: undefined;

			if (problem && production) {
				throw new Error(
					`[git-dates] The sitemap's dates come from git history, and ${problem}. Commit every page, and build from a clone git can read the full history of.`,
				);
			}
			if (problem) {
				logger.warn(`Leaving out the dates git can't give: ${problem}.`);
			}
			if ("dates" in found) {
				dates = found.dates;
			}
		}

		const getContents = () =>
			`export const GIT_DATES = ${JSON.stringify(dates, null, "\t")};\n`;
		addTemplate({ filename: "git-dates.mjs", getContents });
		addServerTemplate({ filename: "#git-dates", getContents });
		addTypeTemplate(
			{
				filename: "types/git-dates.d.ts",
				getContents: () =>
					[
						"/** The date of the last commit of each page's source file, by its path from the app's root. */",
						'declare module "#build/git-dates.mjs" {',
						"\texport const GIT_DATES: Record<string, string>;",
						"}",
						'declare module "#git-dates" {',
						"\texport const GIT_DATES: Record<string, string>;",
						"}",
						"",
					].join("\n"),
			},
			{ nuxt: true, nitro: true },
		);
	},
});
