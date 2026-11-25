// The environment Testlane's git commands run with (§7).

import { describe, expect, it } from "vitest";

import { gitEnv } from "../../src/git/env.ts";

const config = (env: Record<string, string>) =>
	Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, i) => [
		env[`GIT_CONFIG_KEY_${i}`],
		env[`GIT_CONFIG_VALUE_${i}`],
	]);

describe("gitEnv", () => {
	it("turns off the terminal prompt and git's auto maintenance", () => {
		const env = gitEnv({ PATH: "/bin" });
		expect(env.PATH).toBe("/bin");
		expect(env.GIT_TERMINAL_PROMPT).toBe("0");
		expect(config(env)).toEqual([
			["maintenance.auto", "false"],
			["gc.auto", "0"],
		]);
	});

	it("keeps the config the caller already passed through the environment", () => {
		const env = gitEnv({
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "core.sshCommand",
			GIT_CONFIG_VALUE_0: "ssh -4",
		});
		expect(config(env)).toEqual([
			["core.sshCommand", "ssh -4"],
			["maintenance.auto", "false"],
			["gc.auto", "0"],
		]);
	});

	it("starts from zero when GIT_CONFIG_COUNT isn't a count", () => {
		expect(gitEnv({ GIT_CONFIG_COUNT: "lots" }).GIT_CONFIG_COUNT).toBe("2");
	});
});
