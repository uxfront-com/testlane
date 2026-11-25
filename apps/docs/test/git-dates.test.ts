import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readGitDates } from "../modules/git-dates";
import type { Git } from "../modules/git-dates";

/** A fake git that answers from a table, and records what it ran. */
function fakeGit(answers: Record<string, string | Error>) {
	const calls: Array<string> = [];
	const git: Git = async (args) => {
		const command = args.join(" ");
		calls.push(command);
		const answer = answers[command] ?? answers[args.slice(0, 3).join(" ")];
		if (answer instanceof Error) {
			throw answer;
		}
		return answer ?? "";
	};
	return { git, calls };
}

describe("readGitDates", () => {
	it("gives each file the date of its last commit", async () => {
		const { git } = fakeGit({
			"rev-parse --is-shallow-repository": "false",
			"log -1 --format=%cs -- a.md": "2026-11-14",
			"log -1 --format=%cs -- b.md": "2026-11-16",
		});

		expect(await readGitDates(["a.md", "b.md"], git)).toEqual({
			dates: { "a.md": "2026-11-14", "b.md": "2026-11-16" },
			undated: [],
		});
	});

	it("fetches the full history of a shallow clone before it reads a date", async () => {
		const { git, calls } = fakeGit({
			"rev-parse --is-shallow-repository": "true",
			"log -1 --format=%cs -- a.md": "2026-11-14",
		});

		expect(await readGitDates(["a.md"], git)).toEqual({
			dates: { "a.md": "2026-11-14" },
			undated: [],
		});
		expect(calls.slice(0, 2)).toEqual([
			"rev-parse --is-shallow-repository",
			"fetch --unshallow --quiet",
		]);
	});

	it("gives no dates when a shallow clone can't fetch its history", async () => {
		const { git, calls } = fakeGit({
			"rev-parse --is-shallow-repository": "true",
			"fetch --unshallow --quiet": new Error("could not read from remote repository"),
		});

		expect(await readGitDates(["a.md"], git)).toEqual({
			error:
				"the clone is shallow and `git fetch --unshallow` failed: could not read from remote repository",
		});
		expect(calls.some((call) => call.startsWith("log"))).toBe(false);
	});

	it("gives no dates where git can't read a history", async () => {
		const { git } = fakeGit({
			"rev-parse --is-shallow-repository": new Error("spawn git ENOENT"),
		});

		expect(await readGitDates(["a.md"], git)).toEqual({
			error: "git can't read the history here: spawn git ENOENT",
		});
	});

	it("lists a file no commit changed, like a new one", async () => {
		const { git } = fakeGit({
			"rev-parse --is-shallow-repository": "false",
			"log -1 --format=%cs -- a.md": "2026-11-14",
			"log -1 --format=%cs -- new.md": "",
		});

		expect(await readGitDates(["new.md", "a.md"], git)).toEqual({
			dates: { "a.md": "2026-11-14" },
			undated: ["new.md"],
		});
	});

	it("gives no dates when git log fails", async () => {
		const { git } = fakeGit({
			"rev-parse --is-shallow-repository": "false",
			"log -1 --format=%cs": new Error("fatal: bad object HEAD"),
		});

		expect(await readGitDates(["a.md"], git)).toEqual({
			error: "git log failed: fatal: bad object HEAD",
		});
	});
});

describe("readGitDates in a repository", () => {
	let dir: string | undefined;
	afterEach(() => {
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("reads the committer date of the last commit that changed each file", async () => {
		dir = mkdtempSync(join(tmpdir(), "git-dates-"));
		const run = (args: Array<string>, date?: string) =>
			execFileSync("git", args, {
				cwd: dir,
				encoding: "utf8",
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "Test",
					GIT_AUTHOR_EMAIL: "test@example.com",
					GIT_COMMITTER_NAME: "Test",
					GIT_COMMITTER_EMAIL: "test@example.com",
					...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
				},
			}).trim();
		run(["init", "--quiet"]);
		writeFileSync(join(dir, "a.md"), "a");
		writeFileSync(join(dir, "b.md"), "b");
		run(["add", "."]);
		run(["commit", "--quiet", "-m", "first"], "2026-01-02T12:00:00Z");
		writeFileSync(join(dir, "b.md"), "b, again");
		run(["commit", "--quiet", "-am", "second"], "2026-03-04T12:00:00Z");
		writeFileSync(join(dir, "c.md"), "not committed");

		const git: Git = async (args) => run(args);
		expect(await readGitDates(["a.md", "b.md", "c.md"], git)).toEqual({
			dates: { "a.md": "2026-01-02", "b.md": "2026-03-04" },
			undated: ["c.md"],
		});
	});
});
