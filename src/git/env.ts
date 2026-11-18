// The environment every git command Testlane runs gets (§7).

/**
 * Config that git reads from the environment, for this process and every git
 * it starts itself, like the fetch behind a partial clone's on-demand read.
 *
 * Auto maintenance stays off because `git fetch` starts it detached: once a
 * partial clone has 50 packs (each on-demand read adds one), it repacks the
 * whole repo in the background, and a read that lands mid-repack dies with
 * "in the commit graph file but not in the object database". Git's own
 * commands, run by people in a workspace, still keep the repo tidy.
 */
const GIT_CONFIG: ReadonlyArray<readonly [string, string]> = [
  ["maintenance.auto", "false"],
  ["gc.auto", "0"],
];

/**
 * `process.env` plus no terminal prompt (an auth failure errors instead of
 * hanging) and `GIT_CONFIG`, appended after any `GIT_CONFIG_COUNT` entries
 * the caller already set, so theirs still apply.
 */
export function gitEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env = { ...base, GIT_TERMINAL_PROMPT: "0" } as Record<string, string>;
  const count = base.GIT_CONFIG_COUNT ?? "";
  let n = /^\d+$/.test(count) ? Number(count) : 0;
  for (const [key, value] of GIT_CONFIG) {
    env[`GIT_CONFIG_KEY_${n}`] = key;
    env[`GIT_CONFIG_VALUE_${n}`] = value;
    n++;
  }
  env.GIT_CONFIG_COUNT = String(n);
  return env;
}
