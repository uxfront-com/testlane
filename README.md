# Testlane

Materialize any git ref of a configured project into an isolated, runnable local workspace with one command.

AI coding agents produce branches and PRs faster than they can be reviewed. Testlane turns any ref — a PR number, a branch, a commit, a URL, or a local path — into a ready-to-run git worktree, so you can run the app, click through the UI, and poke at the change locally instead of reviewing blind.

The documentation, with guides and a page for every command, is at [testlane.uxfront.com](https://testlane.uxfront.com).

```
testlane my-project 42 code     # PR #42 → worktree → open in editor
testlane my-project 42 run dev  # same workspace → install deps → start dev server
testlane my-project clean --merged # dispose of workspaces whose PRs merged
```

Every workspace command is the same pipeline:

```
resolve(ref) → materialize(workspace) → act(command)
```

- **resolve** — turn a ref (PR number, branch, commit, URL, or path) into a concrete git target.
- **materialize** — ensure a worktree exists for that target, with dependencies installed, seed files copied, and ports allocated. Idempotent and cheap when already materialized.
- **act** — open an editor, run a configured command, exec an arbitrary command, drop into a shell, diff, or sync.

`checkout` is the pipeline with a no-op act step; every other verb is a thin wrapper over it.

## Requirements

- [Node.js](https://nodejs.org) ≥ 18
- `git` ≥ 2.38
- `gh` (optional — enables PR metadata in `list`/`info`, `gh pr diff`, and fork push-back; every `gh` feature degrades gracefully when it is missing)

Testlane runs on stock Node — no Bun, Deno, or other runtime required. Any package manager (npm, pnpm, yarn) installs it.

## Install

Testlane publishes to npm as **`@uxfront/testlane`** and installs a `testlane` binary onto your `PATH`.

### Global install (recommended)

```bash
npm i -g @uxfront/testlane         # npm
pnpm add -g @uxfront/testlane      # pnpm
yarn global add @uxfront/testlane  # yarn (classic)
```

Confirm the install:

```bash
testlane version                 # → testlane 2.0.0
```

If `testlane` is not found, make sure your package manager's global bin directory is on your `PATH` — `$(npm prefix -g)/bin` (npm), `$(pnpm bin -g)` (pnpm), or `$(yarn global bin)` (yarn).

Upgrading? [`CHANGELOG.md`](CHANGELOG.md) lists what changed in each release. Note that 1.0.0 has no `setup` command and reports its version as 0.0.0, and that 1.1.0 removed the `extends` project key. Coming from 1.x, under the old name? The next section walks you through the move.

### Install from a clone (local development)

Working on Testlane itself? Testlane ships as compiled JavaScript, so a clone install has two steps — install dependencies, then build the `dist/` output the CLI runs from — before you link it onto your `PATH`:

```bash
git clone git@github.com:uxfront-com/testlane.git
cd testlane
npm install
npm run build           # emits dist/bin/testlane.js (the linked bin points here)
npm link                # puts `testlane` on your PATH
testlane version        # → testlane 2.0.0
```

`npm link` points `testlane` at your clone's `dist/`. Because the CLI runs compiled output, **re-run `npm run build` after a `git pull`** to pick up new changes.

Prefer pnpm or yarn for the clone flow? Build the same way, then use that tool's global-link command:

```bash
pnpm install && pnpm run build && pnpm link --global    # pnpm (run `pnpm setup` once first)
yarn install && yarn run build && yarn global add "file:$PWD"   # yarn (classic)
```

### Run without installing

Skip the global step and call the built entrypoint from the clone:

```bash
npm install && npm run build
node dist/bin/testlane.js version  # → testlane 2.0.0
```

The examples below use `testlane`; substitute `node dist/bin/testlane.js` if you have not linked it globally.

## Upgrading from uxd

Testlane is the new name of uxd, and 2.0.0 is its first release under that name. Your projects, workspaces and running processes carry over, because Testlane 2.x still reads everything uxd wrote. Each time it falls back to an old name, it prints one warning on stderr with the fix, so you can move at your own pace, and `--json` output stays valid. Testlane 3.0 drops these fallbacks.

Here's how to move over:

1. Swap the package. The two binaries have different names, so you can keep `uxd` installed until you're done:

   ```bash
   npm i -g @uxfront/testlane
   npm rm -g @uxfront/uxd       # once nothing calls uxd any more
   ```

2. Call `testlane` wherever you called `uxd`, like scripts, shell aliases and agent instructions. There's no `uxd` alias, since it would clash with an installed `@uxfront/uxd`.
3. Regenerate your shell completions, because the old script completes `uxd`. Replace `eval "$(uxd completions zsh)"` in your shell's startup file with `eval "$(testlane completions zsh)"`, and the same for bash or fish.
4. Move the config dir and the state dir while no `uxd` or `testlane` command is running. Your repos and worktrees stay where they are, because each project file names their paths:

   ```bash
   mv ~/.uxd ~/.testlane
   mv "${XDG_STATE_HOME:-$HOME/.local/state}/uxd" "${XDG_STATE_HOME:-$HOME/.local/state}/testlane"
   ```

5. Rename the variables you set, `UXD_CONFIG_DIR` to `TESTLANE_CONFIG_DIR` and `UXD_DEBUG` to `TESTLANE_DEBUG`, and the ones your dev servers, hooks and `[env]` values read, like `$UXD_PORT` to `$TESTLANE_PORT`.

This is what Testlane 2.x does with each old name:

| uxd 1.x | Testlane 2.x | What 2.x does with the old name |
| --- | --- | --- |
| `uxd` | `testlane` | Nothing. Scripts that call `uxd` need updating |
| `~/.uxd` | `~/.testlane` | Reads it when `~/.testlane` doesn't exist, and warns |
| `${XDG_STATE_HOME:-~/.local/state}/uxd` | `${XDG_STATE_HOME:-~/.local/state}/testlane` | Reads and writes it when the new dir doesn't exist, and warns |
| `$UXD_CONFIG_DIR` | `$TESTLANE_CONFIG_DIR` | Reads it when `--config-dir` and `$TESTLANE_CONFIG_DIR` aren't set, and warns |
| `UXD_DEBUG=1` | `TESTLANE_DEBUG=1` | Turns on debug output when `$TESTLANE_DEBUG` isn't set, and warns |
| `UXD_PATH`, `UXD_PORT`, `UXD_PORT_1`, … | `TESTLANE_PATH`, `TESTLANE_PORT`, `TESTLANE_PORT_1`, … | Exports both names with the same value. Testlane can't see who reads them, so this one never warns |

When the old and the new name are both there, the new one wins and nothing warns. The project's `[env]`, a command's `env` and `--env` still win over both sets of exported variables.

## Quick start

1. Scaffold your first project in one command. On a fresh machine `testlane setup` creates the config dir (`~/.testlane` by default), sets a base `root`, and writes your first project file — prompting for each field on a terminal, or taking them as flags:

   ```bash
   testlane setup                      # interactive: asks for root, name, repo, default branch
   # or fully non-interactive:
   testlane setup --name my-project --repo git@github.com:my-org/my-project.git
   ```

   This writes `~/.testlane/defaults.toml` (`root`) and a minimal `~/.testlane/my-project.toml`. See [`setup`](#top-level-verbs) for the full prompt/flag reference. Flesh the project out later with `testlane config edit my-project`:

   ```toml
   repo = "git@github.com:my-org/my-project.git"
   editor = "code"

   [setup]
   run = "pnpm install --frozen-lockfile"
   cache_key = ["pnpm-lock.yaml"]

   [commands.dev]
   run = "pnpm dev"
   ```

   (`repo_path`/`worktrees_path` default to `{root}/{project}/…`; `root` comes from `defaults.toml` — see [Configuration](#configuration).)

2. Check your setup and validate the config:

   ```bash
   testlane doctor
   testlane config validate
   ```

3. Materialize a PR and open it:

   ```bash
   testlane my-project 42 code
   ```

4. Run its dev server in the same workspace, then clean up when the PR merges:

   ```bash
   testlane my-project 42 run dev
   testlane my-project clean --merged
   ```

## Refs

A **ref** is what you want to materialize. Testlane parses the ref positional in this order (first match wins):

| Input | Meaning | Example |
|---|---|---|
| `<n>` or `#<n>` | pull request | `testlane my-project 42`, `testlane my-project '#42'` |
| `pr/<n>` | pull request (case-insensitive) | `testlane my-project pr/42` |
| `/`, `./`, `../`, or `~`-prefixed | adopt an existing working tree | `testlane my-project ~/code/checkout shell` |
| 40-char hex | commit SHA (detached worktree) | `testlane my-project 1a2b3c…<40 chars>` |
| `-` | the last-used ref for this project | `testlane my-project - shell` |
| anything else valid as a branch | branch name | `testlane my-project feat/login code` |

Short SHAs are deliberately **not** auto-detected (they collide with hex-ish branch names) — use the full 40 characters or force interpretation with a flag.

**Force a ref's kind** with a disambiguator (bypasses the table above):

```bash
testlane my-project --pr 42 code         # treat 42 as a PR
testlane my-project --branch 42 code     # treat 42 as a branch literally named "42"
testlane my-project --path ./here shell  # adopt ./here
```

**URL form** — pass a clone or web URL in place of the project name; Testlane matches it to the project whose `repo` has the same host/owner/repo (ssh ↔ https, `.git` optional). A `/pull/<n>` or `/tree/<branch>` segment is consumed as the ref:

```bash
testlane https://github.com/my-org/my-project/pull/42 code
testlane https://github.com/my-org/my-project/tree/feat/login diff
testlane git@github.com:my-org/my-project.git 42 code  # ref given separately
```

## Command grammar

```
testlane [global flags] <project|url> <ref> [verb] [args] [-- passthrough]  # workspace commands
testlane [global flags] <project> <project-verb> [args]                     # project commands
testlane [global flags] <top-level-verb> [args]                             # global commands
```

- Everything after the first bare `--` is passed verbatim to the underlying command (`run`, `exec`, `diff`).
- Omit the verb and Testlane uses the project's `default_command` (config; `code` by default): `testlane my-project 42` ≡ `testlane my-project 42 code`.
- A bare `testlane <project>` lists the project's workspaces — or opens an [interactive picker](#interactive-picker) on a TTY.
- If the verb slot names one of your `[commands.*]` entries, it is sugar for `run <name>`: `testlane my-project 42 dev` ≡ `testlane my-project 42 run dev`.

## Commands

### Workspace verbs

Require a project and a ref.

| Verb | Purpose |
|---|---|
| `checkout` | Materialize only; print the worktree path |
| `code` | Materialize; open the workspace in your editor |
| `run <name>` | Materialize + setup; run a configured command |
| `exec -- <argv…>` | Materialize + setup; run an arbitrary command |
| `shell` | Materialize + setup; open an interactive shell in the workspace |
| `sync` | Re-fetch and reset the workspace to its ref |
| `diff` | Show the workspace's diff vs. its base |
| `info` | Print one workspace's details |
| `rm` | Remove one workspace |
| `start <name>` | Materialize + setup, then run a configured command in the background and return once its port accepts connections |
| `stop` | Stop the process `start` left running |
| `logs [-f]` | Print, or follow, that process's log |

**`checkout`** — the scriptable primitive. Prints the absolute worktree path (one line, nothing else) so it composes:

```bash
cd "$(testlane my-project 42 checkout)"
testlane my-project 42 checkout --json     # {"project":"my-project","slug":"pr-42",...}
testlane my-project 42 checkout --fetch    # force a re-fetch before materializing
testlane my-project 42 checkout --setup    # also run [setup] (off by default here)
```

**`code`** — opens the workspace, materializing it first if needed:

```bash
testlane my-project 42 code
testlane my-project 42 code --editor vim   # override the configured editor for this run
```

**`run <name>`** — materializes, runs `[setup]`, then the named command in the worktree. Passthrough args are appended to the command; `--env`/`--port` override the environment for this invocation only:

```bash
testlane my-project 42 run dev
testlane my-project 42 run dev --port 6000
testlane my-project 42 run test -- --watch  # args after -- go to the command
testlane my-project 42 run dev --env DEBUG=1 --no-setup
```

Flags: `--no-setup` (skip `[setup]`), `--reseed` (re-copy seed files), `--fetch` (re-fetch first), `--port <n>`, `--env K=V` (repeatable).

**`exec -- <argv…>`** — like `run`, but for an ad-hoc command spawned directly (no shell):

```bash
testlane my-project 42 exec -- pnpm test
testlane my-project 42 exec --no-setup -- git log --oneline -5
```

**`shell`** — an interactive shell in the workspace, with the full Testlane environment (`$TESTLANE_PORT`, `$TESTLANE_PATH`, …) exported:

```bash
testlane my-project 42 shell
testlane my-project - shell                # the last-used ref
```

**`sync`** — re-fetch the ref and hard-reset the worktree to it. Choose how to treat local changes:

```bash
testlane my-project 42 sync                 # refuses if the tree is dirty
testlane my-project 42 sync --stash         # stash changes, then reset
testlane my-project 42 sync --discard       # discard changes, then reset
testlane my-project 42 sync --fresh         # remove and re-materialize from scratch
```

`--stash`, `--discard`, and `--fresh` are mutually exclusive.

**`diff`** — for a PR workspace with `gh` available, renders `gh pr diff` against the real PR base; otherwise `git diff <merge-base>...HEAD` in the worktree:

```bash
testlane my-project 42 diff
testlane my-project 42 diff --stat
testlane my-project 42 diff --tool            # use git difftool (always local)
testlane my-project 42 diff -- --color-words  # extra args go to gh/git
```

**`info`** / **`rm`**:

```bash
testlane my-project 42 info
testlane my-project 42 info --du            # include on-disk size
testlane my-project 42 info --json
testlane my-project 42 rm                   # remove one workspace (prompts unless --yes)
testlane my-project 42 rm --force --yes     # remove even if dirty, no prompt
```

**`start <name>`**, **`stop`** and **`logs`** let you hand someone a running app and get your terminal back. `start` runs a configured command the way `run` does, but in its own session and process group, with its output appended to `process.log` in the workspace's data dir. It returns once `127.0.0.1:{port}` accepts a TCP connection, prints the URL and leaves the process running after Testlane exits:

```bash
testlane my-project 42 start dev            # prints http://127.0.0.1:5701
testlane my-project 42 start dev --json     # {"pid":4242,"port":5701,"reused":false,...}
testlane my-project 42 logs -f              # follow the log until Ctrl-C
testlane my-project 42 stop
```

A workspace runs one such process at a time. Starting the same command again prints the running one with `"reused": true` and runs no setup or hooks, while a different command exits 2 and names the `stop` to run first. When the command exits before the port is ready, `start` exits 6 and prints the last 20 log lines. When the port isn't ready within `--timeout <seconds>` (300 by default), it stops the process and exits 6, so make sure your server binds `127.0.0.1:$TESTLANE_PORT`.

`start` takes the same flags as `run` apart from `--port`, which is a usage error: the process always serves the workspace's own port, so hooks and `ps` see the same one. `stop` sends `SIGTERM` to the whole process group, then `SIGKILL` after 10 seconds, so a dev server under `bash -c` stops too. It only signals the PID it recorded while that PID still has the start time it had, so a PID the OS has since given to another process is left alone. `rm` and `clean` stop a running process before they remove its workspace, once `pre_clean` has allowed it.

The built-in verbs win over configured commands of the same name, so `testlane my-project 42 start` always means the verb. Run a command named `start` with `testlane my-project 42 run start`, and `doctor` warns about the overlap.

### Project verbs

Require a project, no ref.

**`list`** — the project's workspaces. For PR workspaces, `STATUS` shows the PR state plus a CI mark (`✓` pass / `✗` fail), refreshed from `gh` stale-while-revalidate (bounded to ~2s; the table always renders):

```bash
testlane my-project list
testlane my-project list --du               # add a disk-usage column
testlane my-project list --json             # deterministic, offline (no gh refresh)
```

```
SLUG      KIND    BRANCH      STATUS   PORT  AGE  LAST USED
pr-42     pr      feat/login  open ✓   5700  5m   just now
feat-ui   branch  feat/ui     dirty    5701  2h   1h
```

**`clean`** — remove workspaces by explicit slug or by filter (explicit slugs and filters cannot be combined):

```bash
testlane my-project clean pr-42              # explicit slug(s)
testlane my-project clean --all
testlane my-project clean --merged           # branch merged into the default branch (git-only)
testlane my-project clean --closed           # PR closed or merged (prefers gh, falls back to git)
testlane my-project clean --older-than 7d    # idle ≥ 7d (s/m/h/d/w units)
testlane my-project clean --prune-state      # drop state entries whose worktree is gone
testlane my-project clean --merged --yes     # skip the confirmation prompt
```

Filters intersect. Dirty worktrees are skipped unless `--force`; adopted workspaces are excluded unless `--include-adopted`. `clean` prints a plan and asks for confirmation (pass `--yes` for non-interactive use).

**`ps`** lists the processes `start` left running in the project's workspaces, with their status, `running` or `exited`:

```bash
testlane my-project ps
testlane my-project ps --json               # [{"slug":"pr-42","command":"dev","status":"running",...}]
```

```
SLUG   COMMAND  PID   PORT  STATUS   STARTED                   LOG
pr-42  dev      4242  5701  running  2026-11-11T15:33:15.000Z  /srv/trees/.data/pr-42/process.log
```

### Top-level verbs

No project argument.

```bash
testlane setup                               # create the config dir and scaffold your first project
testlane projects                            # list configured projects
testlane doctor                              # diagnose environment & configs
testlane config path                         # print the config dir
testlane config edit [project]               # edit defaults or a project file
testlane config add [project]                # like `config edit`; seeds a starter template if the file is absent
testlane config validate [project]           # validate all configs, or one
testlane completions <bash|zsh|fish>         # print a completion script
testlane help                                # usage
testlane version                             # version string
```

**`setup`** is the first-run onboarding path: it creates the config dir if missing, ensures a `defaults.root` so derived paths resolve, and scaffolds your first project file — reading the existing [project schema](#project-file), inventing nothing. It's the only command exempt from the config-dir existence check, since it's what creates the dir.

```
testlane setup [--name <name>] [--repo <url>] [--root <dir>] [--default-branch <branch>] [--force]
```

On a terminal it prompts for each field in order; every prompt is also a flag, so the same command runs non-interactively in CI. It asks only for what it needs — `--root` is skipped once `defaults.root` is set.

| Prompt | Flag | Written to | Notes |
|---|---|---|---|
| Base directory for repos & worktrees `[~/dev/testlane]` | `--root` | `defaults.toml` → `root` | Asked only when `defaults.root` is unset; makes derived paths resolve |
| Project name | `--name` | filename `<name>.toml` | Must match `^[a-z0-9][a-z0-9._-]*$`; not `defaults`/`seeds` |
| Repository URL (`git@…` or `https://…`) | `--repo` | `<name>.toml` → `repo` | Required |
| Default branch (blank = auto-detect) | `--default-branch` | `<name>.toml` → `default_branch` | Omitted from the file when blank |

`repo_path` / `worktrees_path` are left implicit — derived from `root` (see [Configuration](#configuration)). The freshly written file is validated with the normal loader before success is reported, so a bad combination fails here rather than on your next command.

Guards:

- Invalid or reserved name, or an empty repo → `E_USAGE`, nothing written.
- Project file already exists → `E_CONFIG` unless you pass `--force` (which overwrites only that project file).
- A required value missing on a non-TTY with no flag → `E_USAGE` naming the flag to pass.
- `--dry-run` prints the planned writes and changes nothing.

Headless / CI — pass every value as a flag (add `-y`/`--yes` to accept the `--root` default without a prompt):

```bash
testlane setup \
  --config-dir ./ci-config \
  --name acme-web \
  --repo git@github.com:acme/acme-web.git \
  --default-branch main \
  --yes
# → created config dir ./ci-config
# → set defaults.root = ~/dev/testlane
# → scaffolded acme-web.toml
# → next: testlane acme-web main
```

**`doctor`** checks `git` version, `gh` presence/auth, config-dir readability, state-dir writability, stale locks, and — per project — schema validity, the bare repo and its fetch refspec, editor binary on `PATH`, commands that shadow built-in verbs, and worktree/state drift. It also warns when `core.hooksPath` is set (see [Worktrees & hooks](#worktrees--hooks)). Exits non-zero if any check fails.

**`completions`** bakes in the verb vocabulary and your current project names; workspace slugs are completed live via `testlane <project> list --json`. Install for the session:

```bash
# bash
eval "$(testlane completions bash)"
# zsh
eval "$(testlane completions zsh)"
# fish
testlane completions fish | source
```

### Interactive picker

On a TTY, a bare `testlane <project>` lists the workspaces and prompts you to pick one; the chosen workspace's path is printed to stdout, so it composes with `cd`:

```bash
cd "$(testlane my-project)"
```

Non-interactive (no TTY) or `--json` falls back to a plain `list`. An empty answer cancels.

## Global flags

| Flag | Effect |
|---|---|
| `--config-dir <dir>` | Override the config directory |
| `--pr` / `--branch` / `--path <v>` | Force how the ref is interpreted |
| `--dry-run` | Print what would run; change nothing |
| `--json` | Machine-readable stdout (`checkout`, `list`, `info`, `start`, `ps`, `projects`, `doctor`) |
| `-q`, `--quiet` | Suppress step logs |
| `-v`, `--verbose` | Print external commands (also enables debug traces) |
| `-y`, `--yes` | Assume "yes" for prompts |
| `--no-color` | Disable ANSI color |

`--dry-run` is available on every mutating command. For `run`/`exec`/`shell` it prints the computed environment as `export` lines followed by the shell-quoted command, so you can see exactly what would execute:

```bash
testlane my-project 42 run dev --dry-run
testlane my-project 42 sync --discard --dry-run
testlane my-project 42 diff --dry-run
```

## Configuration

Testlane reads per-project TOML files from the config dir, resolved as:

```
--config-dir → $TESTLANE_CONFIG_DIR → ~/.testlane
```

Testlane 2.x also falls back to the config dir and variable of its 1.x releases, as the upgrading section near the top explains.

### Layout

```
<config-dir>/
  defaults.toml            # optional global defaults
  my-project.toml          # one file per project; filename = project name
  seeds/
    my-project/            # seed file tree for project "my-project"
      .env.local
```

Project names must match `^[a-z0-9][a-z0-9._-]*$`. `defaults` and `seeds` are reserved names.

### `defaults.toml`

```toml
root = "~/dev/testlane"     # base dir for derived repo_path / worktrees_path
editor = "zed"              # fallback editor preset or template
default_command = "code"    # fallback default verb
```

All keys optional. `env` and `commands` are not allowed here (keep per-project config self-contained).

### Project file

```toml
# ── Repository ────────────────────────────────────────────────
repo = "git@github.com:my-org/my-project.git"  # required. ssh or https.
repo_path = "~/dev/testlane/my-project/repo"        # optional. default: {root}/{project}/repo
worktrees_path = "~/dev/testlane/my-project/trees"  # optional. default: {root}/{project}/trees
default_branch = "main"                             # optional. default: auto-detect from origin HEAD

# ── Behavior ──────────────────────────────────────────────────
editor = "zed"                                      # optional. preset name or template
default_command = "code"                            # optional. verb or configured command name
ports = 1                                        # optional. contiguous ports per workspace, 1–10
base_port = 5700                                 # optional. default: derived per-project

# ── Setup (runs after checkout, before run/exec/shell) ────────
[setup]
run = "pnpm install --frozen-lockfile"              # optional. skipped entirely when absent
cache_key = ["pnpm-lock.yaml", "**/package.json"]  # globs; setup re-runs when they change
seed_files = [".env.local"]                         # relative paths seeded into the worktree
seed_from = "~/dev/my-project"                      # optional extra seed source

# ── Environment for run/exec/shell/hooks (templated) ──────────
[env]
PORT = "{port}"
VITE_BASE_URL = "http://localhost:{port}"

# ── Named commands ────────────────────────────────────────────
[commands.dev]
run = "pnpm dev"                                    # required. templated
cwd = "packages/app"                                # optional, relative to the worktree root
[commands.dev.env]
NODE_OPTIONS = "--max-old-space-size=8192"

[commands.test]
run = "pnpm test"

# ── Hooks ─────────────────────────────────────────────────────
[hooks]
post_checkout = "echo 'workspace ready: {path}'"
# pre_run, post_sync, pre_clean are the other three hook names
```

Path values support leading `~` expansion only. Validation is aggregate — `config validate` reports every schema error in a file at once.

### Template variables

Interpolated (single pass, `{name}` syntax; `{{` escapes a literal `{`) in `[env]` values, `commands.*.run`, `commands.*.cwd`, `hooks.*`, and editor templates:

| Variable | Value |
|---|---|
| `{path}` | Absolute worktree path |
| `{repo_path}` | Absolute primary-repo path |
| `{data_dir}` | Per-workspace data dir |
| `{project}` | Project name |
| `{ref}` | Original ref string as typed |
| `{branch}` | Resolved branch name (or short SHA when detached) |
| `{slug}` | Workspace slug |
| `{port}` | First allocated port |
| `{port+N}` | `port + N`, valid for `N < ports` (e.g. `{port+1}`) |

The same values are always exported to child processes as `TESTLANE_PATH`, `TESTLANE_REPO_PATH`, `TESTLANE_DATA_DIR`, `TESTLANE_PROJECT`, `TESTLANE_REF`, `TESTLANE_BRANCH`, `TESTLANE_SLUG`, `TESTLANE_PORT`, and `TESTLANE_PORT_1…TESTLANE_PORT_{ports-1}`, whether or not your config references them.

### Editors

`editor` accepts a preset name — `zed`, `code`, `cursor`, `windsurf`, `idea`, `webstorm`, `phpstorm`, `goland`, `vim`, `nvim`, `helix`, `hx`, or `terminal` — or a custom template containing `{path}`. Append `:wait` to a template to keep Testlane in the foreground until the editor exits:

```toml
editor = "emacsclient -n {path}"
editor = "kak {path}:wait"
```

## GitHub integration

When `gh` is installed and authenticated, Testlane enriches — but never depends on — the core git flow:

- `list` and `info` show PR state and CI status, refreshed stale-while-revalidate and bounded so the command never blocks.
- `diff` on a PR workspace renders `gh pr diff` against the true PR base.
- `clean --closed` uses `gh`'s authoritative PR state, falling back to cached state, then to the git-only merged heuristic.
- Fork PRs get push-back wiring so your local commits can be pushed to the contributor's branch.

Without `gh`, all of the above degrade gracefully: PR checkout of `refs/pull/<n>/head` still works against GitHub and GitHub Enterprise, and `diff`/`clean` fall back to git. `doctor` reports `gh`'s status.

## Worktrees & hooks

Testlane owns one **bare, partial clone** per project and creates one **git worktree** per ref. A few consequences are worth knowing:

- **`.git` in a worktree is a file, not a directory** — it points back at the primary repo. Tooling that assumes a `.git` directory (some Docker volume setups, older scripts) can trip on this. Nothing for Testlane to fix; just be aware.
- **`core.hooksPath` / husky.** Repos that configure relative hook paths (as husky does) can resolve them incorrectly from a worktree, and `pnpm install` may try to install hooks into the bare repo. `doctor` warns when `core.hooksPath` is set — it does not modify your repo.
- **Partial clones fetch lazily.** The first checkout of a worktree, and a `diff` across not-yet-fetched trees, need network access. Offline use is degraded by design.
- **A branch already checked out** in another worktree cannot be checked out again; Testlane points you at the existing workspace.
- **Manually `rm -rf`-ing a worktree** leaves git metadata behind. `clean` runs `git worktree prune`, and `doctor` flags the drift — reconcile with `testlane <project> clean --prune-state`.

## Exit codes

| Code | Name | Meaning |
|---|---|---|
| 0 | success | — |
| 1 | internal | unexpected error |
| 2 | usage | bad flags or arguments |
| 3 | config | invalid config or unknown project |
| 4 | resolve | ref could not be resolved |
| 5 | git | git (or gh) plumbing failure |
| 6 | setup | `[setup]` command failed |

Errors print as `error(E_CODE): message` on stderr, with a `hint:` line when one applies.

## Development

```bash
npm install
npm test                        # unit + integration (vitest)
npm run typecheck               # tsc --noEmit
npm run build                   # emit dist/
node dist/bin/testlane.js help  # run the built CLI
```

`DESIGN.md` is the source of truth for behavior and scope. See `docs/adrs/` for architecture decision records.

Every change that reaches the published package needs a changeset — run `pnpm changeset` and commit the generated file with your PR. Releases are published to npm by `.github/workflows/changesets.yml`. See `.changeset/README.md` for the author workflow and `docs/release-runbook.md` for how a release runs and how to roll one back.
