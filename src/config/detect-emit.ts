// Turn `config detect` findings into TOML (§9.12): every key line ends with
// `# detected: <reason>` or `# guess: <reason>`, every note is a `# note:` line,
// and the text is parsed back and checked with the same zod schema as a project
// file (or a repo file) before anyone sees it. Pure.

import { parse as parseToml } from "smol-toml";
import { TestlaneError } from "../lib/errors.ts";
import { printableLine } from "../lib/printable.ts";
import { RawProjectSchema, RawRepoSchema, USER_ONLY_KEYS } from "./schema.ts";
import type { Finding } from "./detect.ts";

export interface DraftOptions {
  /** Print only the keys a repo's `.testlane.toml` may hold. */
  repoFile?: boolean;
  /** Where the files came from, for the first line: a path, or `origin/main of app`. */
  source: string;
  /** `setup --default-branch`: written after `repo`. */
  defaultBranch?: string;
}

export interface Draft {
  text: string;
  /** The draft parsed back, under TOML key names. */
  config: Record<string, unknown>;
  /** The findings the text holds, in its order. */
  findings: Array<Finding>;
}

// Characters a terminal or a TOML reader would act on: C0, DEL, C1 and the bidi controls.
const UNSAFE = /[\\"\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

/** A TOML basic string with every control character escaped as `\uXXXX`. */
export function tomlText(value: string): string {
  return `"${value.replaceAll(UNSAFE, (c) =>
    c === "\\" ? "\\\\" : c === '"' ? '\\"' : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  )}"`;
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") {return tomlText(value);}
  if (typeof value === "number") {return String(value);}
  if (Array.isArray(value)) {return `[${value.map(tomlValue).join(", ")}]`;}
  throw new TestlaneError("E_INTERNAL", `config detect: cannot write ${JSON.stringify(value)} as TOML`);
}

const BARE_KEY = /^[A-Za-z0-9_-]+$/;
const keyPart = (k: string): string => (BARE_KEY.test(k) ? k : tomlText(k));

/** A key the repo file may not set (`repo`, `setup.seed_from`, …). */
function userOnly(key: string): boolean {
  return (USER_ONLY_KEYS as ReadonlyArray<string>).includes(key);
}

/** The test hook criterion 6 uses: changes the text before validation. */
let transform: ((text: string) => string) | null = null;
export function setDraftTransform(fn: ((text: string) => string) | null): void {
  transform = fn;
}

/**
 * Write the findings as TOML and validate it. A draft that doesn't validate is
 * a bug in the detector, never printed: E_INTERNAL with every issue.
 */
export function renderDraft(all: Array<Finding>, opts: DraftOptions): Draft {
  const findings = all.filter((f) => f.key === null || !(opts.repoFile && userOnly(f.key)));
  const keys = new Set(findings.filter((f) => f.key !== null).map((f) => f.key!));
  const lines: Array<string> = [];
  const used: Array<Finding> = [];

  const noteLine = (f: Finding): void => {
    lines.push(`# note: ${printableLine(f.reason)}`);
    used.push(f);
  };
  const notesAt = (key: string): void => {
    for (const f of findings) {if (f.key === null && f.at === key) {noteLine(f);}}
  };
  const keyLine = (f: Finding, name: string): void => {
    notesAt(f.key!);
    const kind = f.kind === "guess" ? "guess" : "detected";
    lines.push(`${name} = ${tomlValue(f.value)}  # ${kind}: ${printableLine(f.reason)}`);
    used.push(f);
  };
  const header = (title: string): void => {
    if (lines.length) {lines.push("");}
    lines.push(`[${title}]`);
  };

  const first: Finding = {
    key: null,
    value: null,
    kind: "note",
    confidence: "high",
    reason: `drafted by testlane config detect from ${opts.source}; review every line marked guess or note`,
  };
  noteLine(first);
  for (const f of findings) {if (f.key === null && (f.at === undefined || !keys.has(f.at))) {noteLine(f);}}

  const top = findings.filter((f) => f.key !== null && !f.key.includes("."));
  for (const f of top) {
    keyLine(f, f.key!);
    if (f.key === "repo" && opts.defaultBranch !== undefined && !opts.repoFile) {
      const branch: Finding = {
        key: "default_branch",
        value: opts.defaultBranch,
        kind: "detected",
        confidence: "high",
        reason: "setup --default-branch",
      };
      keyLine(branch, "default_branch");
    }
  }

  const section = (prefix: string, title: string): void => {
    const rows = findings.filter((f) => f.key?.startsWith(`${prefix}.`) && !f.key.slice(prefix.length + 1).includes("."));
    if (!rows.length) {return;}
    header(title);
    for (const f of rows) {keyLine(f, keyPart(f.key!.slice(prefix.length + 1)));}
  };
  section("setup", "setup");
  section("env", "env");

  const commands: Array<string> = [];
  for (const f of findings) {
    const m = f.key?.match(/^commands\.([^.]+)\./);
    if (m && !commands.includes(m[1]!)) {commands.push(m[1]!);}
  }
  for (const c of commands) {
    section(`commands.${c}`, `commands.${keyPart(c)}`);
    section(`commands.${c}.env`, `commands.${keyPart(c)}.env`);
  }

  let text = `${lines.join("\n")}\n`;
  if (transform) {text = transform(text);}
  const config = validateDraft(text, Boolean(opts.repoFile));
  return { text, config, findings: used.slice(1) };
}

/** Parse a draft back and check it with `RawProjectSchema` (or `RawRepoSchema`). */
export function validateDraft(text: string, repoFile: boolean): Record<string, unknown> {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(text) as Record<string, unknown>;
  } catch (error) {
    throw new TestlaneError("E_INTERNAL", `config detect wrote TOML that doesn't parse: ${printableLine((error as Error).message)}`);
  }
  const result = (repoFile ? RawRepoSchema : RawProjectSchema).safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new TestlaneError("E_INTERNAL", `config detect wrote a draft that doesn't validate: ${printableLine(issues)}`);
  }
  return parsed;
}
