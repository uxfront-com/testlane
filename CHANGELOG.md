# Changelog

## 4.0.0

### Major Changes

- bb9a9f3: Require Node.js 22 or later. Node.js 18 and 20 have reached end of life, so `engines.node` in `package.json` is now `>=22` and Testlane is tested on Node.js 22 and 24 only. **Breaking:** if you run Node.js 18 or 20, upgrade Node.js to 22 or later before you install this version.

### Patch Changes

- 78d3a93: Testlane now validates config files and MCP tool arguments with zod 4, so most validation messages read differently. For example, `ports: Number must be less than or equal to 10` is now `ports: Too big: expected number to be <=10`. The `file`, `path` and `message` fields of `config validate --json` and the exit codes stay the same, so only a script that matches on a message's text needs updating. A command name that breaks the naming rule still says which rule, as in `commands.Bad Name: must match ^[a-z0-9][a-z0-9:_-]*$`.

## 3.0.1

### Patch Changes

- 97381da: Make `setup --detect` and `config detect` read a large monorepo in one fetch, and stop git's background maintenance from breaking them. Before, detection downloaded each `package.json` on its own, so a repository like n8n took minutes, and after 50 downloads git started repacking the whole clone in the background, which could make a read fail with "in the commit graph file but not in the object database". Now detection downloads every file it may read in a single `git fetch`, and every git command Testlane runs passes `maintenance.auto=false` and `gc.auto=0` through `GIT_CONFIG_COUNT`, after any entries your environment already sets.

## 3.0.0

### Major Changes

- e8fe6dc: Testlane now reads and writes only its own names. It reads its config from `--config-dir`, `$TESTLANE_CONFIG_DIR` or `~/.testlane`, in that order, and keeps its state in `${XDG_STATE_HOME:-~/.local/state}/testlane`. Debug output turns on only with `TESTLANE_DEBUG=1` or `--verbose`, and the commands, setup and hooks it runs get only the `TESTLANE_*` variables. If you still keep a config or state directory, or set a variable, under another name, move or rename it to the one above while no `testlane` command is running.

### Minor Changes

- 87a665c: Add a docs guide, "Use Testlane from an Agent", for AI coding agents that drive Testlane. It lists the commands to call to check out a ref, start a command, read its logs, stop it and remove the workspace, the `--json` fields to read, how to handle each exit code and which interactive commands to avoid. It ends with a block to paste into `AGENTS.md` or `CLAUDE.md`. The CLI itself is unchanged.
- bb6627f: Add `testlane config detect [path | project]`, which drafts a project config from a repository's own files: its package manager and frozen install, its workspace packages, a dev command for each app on its own port, bound to `127.0.0.1` for Nuxt, Next.js, Vite, Astro and Storybook, a `turbo` build before dev, seed files from `.env*.example`, and `test` and `check` commands. It only reads files and runs nothing from the repository, and every line ends with `# detected:`, `# guess:` or `# note:` so you can see why it's there. `--repo-file` prints only the keys a `.testlane.toml` may hold, and `--json` prints each finding with its reason and confidence. `config add <url> --detect` and `setup --detect` start the project file from the same draft when the repository has no `.testlane.toml`. Without these flags, nothing changes.
- 9cf6e40: Add `testlane mcp`, an MCP server over stdio with no new dependency, so an AI agent can check out a ref, start a command, read its logs, stop it and remove the workspace through typed tools instead of parsing the CLI's output. Its twelve tools (`projects`, `doctor`, `config_validate`, `list`, `ps`, `info`, `diff`, `logs`, `checkout`, `start`, `stop` and `rm`) call the same code as their commands and return the same JSON as `--json`, and `checkout` and `start` send progress and take a `timeout`. Connect it with `claude mcp add testlane -- testlane mcp`. A project named `mcp` can now only be reached by its repository URL, and a branch ref can no longer start with `-`, which git would read as an option.
- 0076bf5: Read a `.testlane.toml` that a repo commits, so `testlane config add <url>` sets up a project without hand-written TOML. Its commands run only after you approve the file from the default branch, and `config show` marks where each key came from. A script that runs off a terminal without `--yes` stops with `E_CONFIG` once the repo adds or changes the file, until you run `testlane config trust <project>`.

### Patch Changes

- 0076bf5: `--branch` refuses names that git would read as a refspec, like `a:b` or `+x`, with exit code 4. Before, such a name reached `git fetch`, where it could write a ref other than the branch you asked for. On macOS and Windows, a branch name that differs from another fetched branch only in case, like `Main` beside `main`, is refused too, since both would land in the same file.
- 09abe3e: State Testlane's MIT licence: the package now ships a `LICENSE` file and declares `"license": "MIT"`, so npm shows the licence on its page. The CLI itself is unchanged.
- 0e9966f: Rewrite the README so it reads in one sitting, with the depth left to [testlane.dev](https://testlane.dev). Each of the three verb groups is now a table, the project file's keys are in a table too, and every section links to its page on the site. It still lists every exit code, global flag and template variable. The CLI itself is unchanged.
- 3b7fa9f: Point the README's documentation link at [testlane.dev](https://testlane.dev), since the old address no longer resolves.
- 77d72b6: Link the package's npm page to its docs at [testlane.dev](https://testlane.dev), rather than the GitHub README, and add keywords like `worktree`, `pull-request` and `dev-server` so npm search finds it. The CLI itself is unchanged.

## 2.0.0

### Major Changes

- 3e975ef: Rename uxd to Testlane. The package is now `@uxfront/testlane` and its command is `testlane`, so install it with `npm i -g @uxfront/testlane` and remove the old one with `npm rm -g @uxfront/uxd` once nothing calls `uxd` any more. Commands now get `TESTLANE_PATH`, `TESTLANE_PORT` and the rest of the `TESTLANE_*` variables, the config dir is `~/.testlane` (set with `TESTLANE_CONFIG_DIR`), the state dir is `${XDG_STATE_HOME:-~/.local/state}/testlane`, debug output turns on with `TESTLANE_DEBUG=1`, and `setup` suggests `~/dev/testlane` as the root.

  Testlane 2.x still works on what uxd left behind. It reads `~/.uxd` and the old state dir when the new ones don't exist, reads `UXD_CONFIG_DIR` and `UXD_DEBUG=1` when the new variables aren't set, and exports every variable under its `UXD_*` name too, so dev servers that bind `$UXD_PORT` keep working. Each fallback warns once per run on stderr with the fix, like `mv ~/.uxd ~/.testlane`, and 3.0 removes them.

  **Breaking:** There's no `uxd` binary any more, so update the scripts, aliases and agent instructions that call `uxd`, and regenerate your shell completions with `testlane completions <bash|zsh|fish>`, because the old script completes `uxd`. The README's "Upgrading from uxd" section has every step.

## 1.2.1

### Patch Changes

- ab7e828: Declare the source repository in `package.json`, so the npm page links to the code and releases from CI carry a provenance statement that npm can verify. The CLI itself is unchanged.

## 1.2.0

### Minor Changes

- 4546964: Add `start`, `stop`, `logs` and `ps`, so you can hand someone a running app and get your terminal back. `uxd <project> <ref> start <name>` runs a configured command in the background, returns once `127.0.0.1:{port}` accepts connections and leaves it running after uxd exits, with its output in a log that `logs` prints and `logs -f` follows. `stop` stops the whole process tree, `uxd <project> ps` lists what's running, and `rm` and `clean` now stop a running process before they remove its workspace. If you've configured a command named `start`, `stop`, `logs` or `ps`, note that the new verbs win over it, so `uxd <project> <ref> start` now runs the verb, while `uxd <project> <ref> run start` still reaches your command and `uxd doctor` warns about the overlap.

  Under `--json`, what `[setup]` and hooks print now goes to stderr, so `start --json` and `checkout --setup --json` print nothing but the JSON on stdout.

## 1.1.1

### Patch Changes

- fd1e014: Skip `node_modules/` and `.git/` while expanding `setup.cache_key` globs, not
  after. A `**` pattern such as `**/package.json` used to walk every installed
  dependency before the matches were filtered, so once a workspace had been set
  up, each later `run` could spend a minute or more hashing in a large monorepo
  before it started anything. The set of hashed files is unchanged, so existing
  workspaces do not re-run setup.
- d956cec: Publish releases with Changesets behind the packaging gate. No CLI behavior
  changes; the release itself is the proof that the pipeline works end to end.

All notable changes to [`@uxfront/uxd`](https://www.npmjs.com/package/@uxfront/uxd)
are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-09-07

### Removed

- **Breaking — `extends` in project files is gone.** 1.0.0 accepted an optional
  `extends` key that pointed a project file at a repo-committed base config, plus
  a `uxd config link <name> --from <path>` command to scaffold that pointer. Both
  were reverted. Project files are validated strictly, so a leftover `extends`
  key now fails every command that loads the config:

  ```bash
  uxd config validate my-project
  ```

  ```
  my-project.toml: (root): Unrecognized key(s) in object: 'extends'
  ```

  **To migrate:** open the project file with `uxd config edit my-project`, delete
  the `extends` line, and copy any keys you relied on from the referenced file
  into the project file.

  The `uxd config link` subcommand is gone with it:

  ```
  error(E_USAGE): unknown config subcommand 'link'
  hint: expected: path | edit | add | validate
  ```

  Config layering may return in a later release. Follow
  [the project file reference](https://github.com/uxfront-com/uxd/blob/main/apps/docs/content/docs/configuration/02.project-file.md)
  for the keys that are supported today.

### Added

- **`uxd setup` — first-run onboarding in one command.** On a fresh machine it
  creates the config directory (`~/.uxd` by default), sets a base `root` so
  derived paths resolve, and writes your first project file. It is the only
  command exempt from the config-directory existence check, because it is what
  creates the directory. On a terminal it prompts for each field; every prompt is
  also a flag, so the same command runs unattended in CI:

  ```bash
  uxd setup \
    --config-dir ./ci-config \
    --name acme-web \
    --repo git@github.com:acme/acme-web.git \
    --default-branch main \
    --yes
  ```

  ```
  → created config dir ./ci-config
  → set defaults.root = ~/dev/uxd
  → scaffolded acme-web.toml
  → next: uxd acme-web main
  ```

  `--dry-run` prints the planned writes and changes nothing. An existing project
  file is refused with `E_CONFIG` unless you pass `--force`. See
  [the top-level verb reference](https://github.com/uxfront-com/uxd/blob/main/apps/docs/content/docs/cli/04.top-level-verbs.md)
  for the full prompt and flag reference.

- **`uxd config add` seeds a starter template.** Opening a project file that does
  not exist used to drop you into an empty buffer, so you had to know the TOML
  schema by heart. `add` (and `edit`) now writes a commented template first —
  only `repo` is uncommented — so a valid config is one edit away. Existing files
  are never touched, and `--dry-run` prints the template plus the editor command
  without creating anything. Reserved or malformed project names now exit with a
  usage error and write nothing, which `edit` previously skipped.

### Fixed

- **`uxd version` printed `uxd 0.0.0`.** The version lookup matched the package
  name `uxd` while the manifest declares `@uxfront/uxd`, so it never matched and
  always fell back. It now reports the real version:

  ```bash
  uxd version
  ```

  ```
  uxd 1.1.0
  ```

- **`uxd doctor` missed hand-deleted workspaces.** The orphan check compared uxd
  state against `git worktree list` only. Git does not prune automatically, so a
  workspace you removed with `rm -rf` stayed listed and the warning never fired.
  `doctor` now also checks the filesystem.

- **`uxd doctor` warned forever when `worktrees_path` crossed a symlink** — `/tmp`
  on macOS, for example. Git prints resolved paths, so every entry mismatched and
  the false warnings drowned out real drift. Both sides are now canonicalized.

- **`uxd doctor` named the editor binary inconsistently** and warned on healthy
  machines. It printed the resolved binary in one half of the message and a
  hardcoded `code` in the other, and it searched `PATH` for binaries given as
  absolute paths — so the `terminal` preset (`$SHELL`) warned every run.

## [1.0.0] — 2026-07-24

First published release on npm as `@uxfront/uxd`.

> [!WARNING] > **1.0.0 has no `uxd setup` command.** The verb did not exist yet, so the CLI
> reads `setup` as a project name and fails:
>
> ```
> error(E_CONFIG): unknown project 'setup'
> ```
>
> This is not a configuration problem. Upgrade to 1.1.0 or later:
>
> ```bash
> npm i -g @uxfront/uxd@latest
> ```
>
> Confirm the upgrade with `uxd version`. On 1.0.0 that command reports
> `uxd 0.0.0` (see the version fix above), so any other output means the upgrade
> landed. 1.1.0 adds a packaging test that fails the build if a top-level verb is
> ever missing from the published artifact again.

Entries before 1.1.0 are not itemized. This file starts at the 1.1.0 release; for
earlier history read the
[commit log](https://github.com/uxfront-com/uxd/commits/main).

[Unreleased]: https://github.com/uxfront-com/uxd/compare/5be2696...HEAD
[1.1.0]: https://github.com/uxfront-com/uxd/compare/ce722ab...5be2696
[1.0.0]: https://github.com/uxfront-com/uxd/commit/ce722ab
