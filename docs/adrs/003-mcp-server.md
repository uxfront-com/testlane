# ADR-003: A hand-written MCP server over stdio, with no new dependency
Date: 2026-11-13 · Status: Accepted (operator approval, 2026-11-13)
Deciders: Operator (alex) · Informed by: the agent guide (PR #54)
Supersedes: none · Superseded by: none
Amends: none (the ADR-001/002 dependency budget stays at four runtime packages)

## Context

AI coding agents that speak the Model Context Protocol (MCP) can drive Testlane
today only by shelling out to the CLI and parsing its `--json` stdout. A
`testlane mcp` stdio server gives them typed tools instead: check out a ref,
start a command, read its logs, stop it, remove it.

A stdio MCP server needs only a small part of the protocol: the JSON-RPC 2.0
envelope over newline-delimited stdin/stdout, `initialize`, `tools/list`,
`tools/call` and `ping`, plus the `notifications/initialized`,
`notifications/progress` and `notifications/cancelled` notifications.
Resources, prompts, sampling, elicitation and the HTTP transports are out of
scope.

ADR-001 froze the runtime dependency budget, and ADR-002 raised it to four
packages (`picocolors`, `smol-toml`, `tinyglobby`, `zod`). Any addition is a
design change that needs its own decision. So the first question is whether the
server comes from the official SDK or is written by hand.

The live options at the decision point:

- **A) Add `@modelcontextprotocol/sdk`.** Measured on 2026-11-13 with
  `@modelcontextprotocol/sdk@1.32.2` (`npm install --omit=dev
  --ignore-scripts` next to Testlane's four packages). It adds **94 package
  installs** (91 distinct versions of 90 packages: `content-type` comes at
  1.0.5 and, nested four times, at 2.1.0). The installed runtime tree grows
  from **5.6 MB (6 installs) to 24.3 MB (100 installs)**. The SDK itself is 6.2 MB. Its direct dependencies are
  `@hono/node-server`, `ajv`, `ajv-formats`, `content-type`, `cors`,
  `cross-spawn`, `eventsource`, `eventsource-parser`, `express`,
  `express-rate-limit`, `hono`, `jose`, `json-schema-typed`, `pkce-challenge`,
  `raw-body`, `zod` and `zod-to-json-schema`. It needs `zod@^3.25 || ^4.0`, so
  Testlane's `zod` range (`^3.24.1`) would also move. The full list of added
  versions: `@hono/node-server@2.1.8`, `@modelcontextprotocol/sdk@1.32.2`,
  `accepts@2.0.0`, `ajv-formats@3.0.1`, `ajv@8.20.0`, `body-parser@2.4.0`,
  `bytes@3.1.2`, `call-bind-apply-helpers@1.0.2`, `call-bound@1.0.4`,
  `content-disposition@2.0.1`, `content-type@1.0.5`, `content-type@2.1.0`, `cookie-signature@1.2.2`,
  `cookie@0.7.2`, `cors@2.8.6`, `cross-spawn@7.0.6`, `debug@4.4.3`,
  `depd@2.0.0`, `dunder-proto@1.0.1`, `ee-first@1.1.1`, `encodeurl@2.0.3`,
  `es-define-property@1.0.1`, `es-errors@1.3.0`, `es-object-atoms@1.1.2`,
  `escape-html@1.0.3`, `etag@1.8.1`, `eventsource-parser@3.1.1`,
  `eventsource@3.0.7`, `express-rate-limit@8.7.4`, `express@5.3.0`,
  `fast-deep-equal@3.1.3`, `fast-uri@3.1.9`, `finalhandler@2.1.1`,
  `forwarded@0.2.0`, `fresh@2.0.0`, `function-bind@1.1.2`,
  `get-intrinsic@1.3.0`, `get-proto@1.0.1`, `gopd@1.2.0`, `has-symbols@1.1.0`,
  `hasown@2.0.4`, `hono@4.13.18`, `http-errors@2.0.1`, `iconv-lite@0.7.3`,
  `inherits@2.0.4`, `ip-address@10.7.6`, `ipaddr.js@1.9.1`,
  `is-promise@4.0.0`, `isexe@2.0.0`, `jose@6.2.17`,
  `json-schema-traverse@1.0.0`, `json-schema-typed@8.0.2`,
  `math-intrinsics@1.1.0`, `media-typer@1.1.1`, `merge-descriptors@2.0.0`,
  `mime-db@1.54.0`, `mime-types@3.0.2`, `ms@2.1.3`, `negotiator@1.1.0`,
  `object-assign@4.1.1`, `object-inspect@1.13.4`, `on-finished@2.4.2`,
  `once@1.4.0`, `parseurl@1.3.3`, `path-key@3.1.1`, `path-to-regexp@8.4.2`,
  `pkce-challenge@5.0.1`, `proxy-addr@2.0.8`, `qs@6.17.1`,
  `range-parser@1.3.0`, `raw-body@3.0.2`, `require-from-string@2.0.2`,
  `router@2.2.0`, `safer-buffer@2.1.2`, `send@1.2.1`, `serve-static@2.2.1`,
  `setprototypeof@1.2.0`, `shebang-command@2.0.0`, `shebang-regex@3.0.0`,
  `side-channel-list@1.0.1`, `side-channel-map@1.0.1`,
  `side-channel-weakmap@1.0.2`, `side-channel@1.1.1`, `statuses@2.0.2`,
  `toidentifier@1.0.1`, `type-is@2.1.0`, `unpipe@1.0.0`, `vary@1.1.2`,
  `which@2.0.2`, `wrappy@1.0.2`, `zod-to-json-schema@3.25.2`.
  **Steelman:** the maintained reference implementation. It tracks the spec
  (it negotiates `2025-11-25` down to `2024-10-07`), validates every message,
  and gives later features (resources, elicitation, the HTTP transport) for
  free. Most of its weight is the HTTP server and OAuth stack, which a stdio
  server never loads, but every user still installs it.
- **B) Write the server by hand** (chosen). A JSON-RPC 2.0 loop over stdio that
  handles only the methods above, in a few hundred lines on `node:readline`,
  with `zod` (already in the budget) validating tool arguments. **Steelman:**
  no change to the budget, the install or the lockfiles. Every line is ours to
  test, which is the reasoning ADR-001 applied to CLI frameworks. **Cost:** we
  track the spec ourselves, and a protocol change that a mainstream client
  starts to need is our work.

## Decision

We will write the MCP server by hand (option B), as `testlane mcp`, a new
top-level verb. It speaks JSON-RPC 2.0 over stdio, newline-delimited, and
handles `initialize`, `ping`, `tools/list` and `tools/call`, plus the
`initialized`, `progress` and `cancelled` notifications.

It supports the protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26` and `2024-11-05`. It
echoes the version a client asks for when it supports it, and answers with
`2025-11-25` otherwise, and declares only the `tools` capability. It rejects a
JSON-RPC batch (an array) with `-32600`. The runtime dependency budget stays at
four packages.

### The tools

Each tool calls the same internal function as its CLI verb, in the same
process, with `--json` and `--yes` set. The server never spawns the CLI. Each
tool takes structured arguments (`project`, `ref`, an optional `kind` of `pr`,
`branch` or `path` in place of the `--pr`/`--branch`/`--path` disambiguators,
and the verb's own flags as booleans), never a raw argv, and never a `--`
passthrough.

| Tool              | CLI verb                                   | Annotations                                    |
| ----------------- | ------------------------------------------ | ---------------------------------------------- |
| `projects`        | `testlane projects --json`                 | `readOnlyHint`                                 |
| `doctor`          | `testlane doctor --json`                   | `readOnlyHint`                                 |
| `config_validate` | `testlane config validate --json`          | `readOnlyHint`                                 |
| `list`            | `testlane <project> list --json`           | `readOnlyHint`                                 |
| `ps`              | `testlane <project> ps --json`             | `readOnlyHint`                                 |
| `info`            | `testlane <project> <ref> info --json`     | `readOnlyHint`                                 |
| `diff`            | `testlane <project> <ref> diff`            | `readOnlyHint`                                 |
| `logs`            | `testlane <project> <ref> logs`, last N    | `readOnlyHint`                                 |
| `checkout`        | `testlane <project> <ref> checkout --json` | `readOnlyHint: false`, `destructiveHint: false` |
| `start`           | `testlane <project> <ref> start <name> --json` | `readOnlyHint: false`, `destructiveHint: false` |
| `stop`            | `testlane <project> <ref> stop`            | `readOnlyHint: false`, `destructiveHint: false` |
| `rm`              | `testlane <project> <ref> rm --yes`        | `destructiveHint: true`                        |

MCP assumes `destructiveHint: true` for a tool that isn't read-only, so
`checkout`, `start` and `stop` set it to `false` explicitly.

**Left out, and why:**

- `clean` (above all `clean --all`): removes many workspaces from one call. An
  agent removes the one it made, with `rm`.
- `shell`, `code`, `config edit`, `config add` (today an alias of `config
  edit`): interactive. They open a shell or an editor and wait for a person.
- `exec` and `run`: `exec` runs an arbitrary argv, and `run` holds the call
  open for as long as the command runs. `start` covers servers.
- `sync`: it can reset a worktree with `--hard`. Left for a later decision.
- `setup`, `completions`, `help`, `version`: for a person setting up a shell.
- The `default_command` fall-through (`testlane <project> <ref>` with no verb,
  `code` by default): no tool reaches it, since each tool names its verb.
- `config_detect` and `config_add <url>`: they don't exist yet. They can join
  as tools when they ship, under the trust rule below.

### What a tool returns

- **Verbs with `--json`** (`projects`, `doctor`, `config_validate`, `list`,
  `ps`, `info`, `checkout`, `start`): one text content block holding exactly
  the JSON that the verb prints to stdout with `--json`. Three of these shapes
  are arrays, and MCP's `structuredContent` must be an object, so the server
  sends no `structuredContent` and no `outputSchema`, rather than change a
  shape. `isError` is `true` when the verb's exit code isn't `0` (for example
  `doctor` with a failed check, or `config_validate` with issues).
- **Verbs without `--json`** (`stop`, `logs`, `diff`, `rm`): one text block
  holding `{"exitCode": n, "stdout": "…", "stderr": "…"}`, where `stdout` is
  what the verb printed to stdout and `stderr` its step and warning lines.
  `logs` takes `lines` (default 100, at most 1000) and returns only the last
  `lines` lines. It never follows. `diff` keeps at most 1 MiB of output and
  adds `"truncated": true` past that. `rm` adds `"removed": true | false`. A
  workspace that `rm` keeps (uncommitted changes, or a failed `pre_clean`
  hook) gives `removed: false` and `isError: true`, though the CLI exits `0`,
  so an agent can't miss it. The `rm` tool takes no `force`: only a person
  throws away uncommitted work.
- **Errors.** A verb that throws gives `isError: true` and
  `{"error": {"errCode": "E_…", "exitCode": n, "message": "…", "hint": "…"},
  "stderr": "…"}`. Arguments that fail validation give `isError: true` and a
  message, so the model can correct them. An unknown tool name is a JSON-RPC
  error, `-32602`.

### Rules the server keeps

1. **stdout carries only protocol messages.** The server keeps the one stdout
   writer for itself, and sends any other write to stdout to stderr. Each
   call's verb output goes to a buffer of its own. No child process gets the
   server's stdout or stdin: setup and hook output goes to stderr, `diff`
   output to the call's buffer, and every child's stdin is closed.
2. **Progress.** When a `checkout` or `start` request carries a
   `progressToken`, each step line becomes a `notifications/progress` message,
   and a heartbeat at least every 5 seconds repeats the last step's message
   with a higher `progress`, as MCP requires, while the call runs.
3. **Timeouts.** `checkout` and `start` take `timeout`, in seconds (default
   600). It bounds the whole call. `start` also passes it as `--timeout`, with
   5 seconds more, so the call's own deadline always fires first. When
   it runs out, the server stops what the call started (setup and hook
   processes, a waiting lock, a server that isn't ready yet), waits for those
   processes to exit (2 seconds' grace, then SIGKILL), and answers
   `isError: true` with `{"timedOut": true, "timeoutSeconds": n, "stderr":
   "…"}`, whatever exit code the verb would have given. A
   `notifications/cancelled` for the request stops it the same way, with no
   response.
4. **Config per call.** Each call reads the config dir, as each CLI run does.
   `testlane mcp` starts even when the config dir is missing, and each tool
   but `doctor` then fails with the CLI's `E_CONFIG` error.
5. **Trust is the user's.** The server never records trust in a repo config,
   and no tool argument approves one. When repo-config trust ships,
   a tool that meets an untrusted config returns an error that tells the user
   to run `testlane config trust <project>` themselves.

## Consequences

Good: no new runtime dependency, and no change to the install size or the
lockfiles. Agents get typed tools with the CLI's own JSON. The CLI and the
server share one code path for every verb, so their shapes can't drift. The
stdout rule and the timeout make the server safe to leave running in a client.

Bad: the protocol layer is ours to maintain. A new spec version, or a client
that needs a feature we don't handle, is our work. The verbs now write through
a per-call output sink instead of `process.stdout`, and the child-process
helpers gain a closed-stdin mode and abort, which the CLI doesn't use. A project
named `mcp` can't be reached by name any more, as with any top-level verb
(the URL form still works).

Neutral: `zod`, already in the budget, validates tool arguments. Each tool's
arguments are one hand-written list, which builds both the JSON Schema in
`tools/list` and the `zod` check, so the two can't disagree.

## Revisit triggers

Reopen this decision (new ADR, superseding this one) if any of these happens:

- Testlane needs an MCP feature beyond stdio tools: resources, prompts,
  elicitation (for example to ask the user to trust a repo config), or the
  HTTP transport.
- A mainstream MCP client fails against the server because of a protocol
  change, and the fix costs more than adopting the SDK.
- The SDK ships a stdio-only server package whose install adds no more than a
  few packages.
