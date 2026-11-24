// The two small parsers `config detect` needs (§9.12): the `packages:` list of
// a `pnpm-workspace.yaml`, read by hand since the dependency budget has no YAML
// parser (ADR-001), and a glob matcher for workspace patterns, since Node 18 has
// no `path.matchesGlob`. Pure: strings in, values out.

export interface WorkspaceYaml {
  /** The `packages:` entries, quotes removed; `undefined` when the key is absent. */
  packages?: Array<string>;
  /** Other top-level keys, in file order. */
  skippedKeys: Array<string>;
  /** Lines this parser could not read, trimmed, in file order. */
  skippedLines: Array<string>;
}

const TOP_KEY = /^(?:"([^"]*)"|'([^']*)'|([^\s#:'"-][^:#]*?))\s*:(.*)$/;

/** Strip a `# comment` that follows whitespace (or starts the text). Quotes hide `#`. */
function stripComment(text: string): string {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote) {
      if (c === quote) {quote = null;}
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(text[i - 1]!))) {
      return text.slice(0, i);
    }
  }
  return text;
}

/** A flow list's items, split on commas outside quotes. */
function splitFlow(text: string): Array<string> {
  const parts: Array<string> = [];
  let quote: string | null = null;
  let cur = "";
  for (const c of text) {
    if (quote) {
      if (c === quote) {quote = null;}
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ",") {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

/**
 * One workspace pattern: `apps/*`, `"apps/*"` or `'apps/*'`. `null` when it
 * isn't a scalar, or holds a brace or bracket glob, which the matcher doesn't read.
 */
function scalar(text: string): string | null {
  const value = rawScalar(text);
  return value === null || /[{}[\]]/.test(value) ? null : value;
}

function rawScalar(text: string): string | null {
  const t = text.trim();
  if (t === "") {return null;}
  const dq = t.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (dq) {return dq[1]!.replace(/\\(.)/g, "$1");}
  const sq = t.match(/^'((?:[^']|'')*)'$/);
  if (sq) {return sq[1]!.replace(/''/g, "'");}
  // A plain scalar can't start with an indicator or hold a flow character. A
  // leading `!` is pnpm's exclusion, not a YAML tag, when the rest is a path.
  if (/^[[\]{}&*|>%@`"'?:-]/.test(t)) {return null;}
  if (/[[\]{},]|:\s|\s#/.test(t)) {return null;}
  return t;
}

/**
 * Read `packages:` from a `pnpm-workspace.yaml`: a block list (`- apps/*`) or a
 * one-line flow list (`[a, b]`). Anything else is reported, never thrown.
 */
export function parseWorkspaceYaml(text: string): WorkspaceYaml {
  const out: WorkspaceYaml = { skippedKeys: [], skippedLines: [] };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let inPackages = false;

  for (const raw of lines) {
    const line = stripComment(raw).replace(/\s+$/, "");
    if (line.trim() === "") {continue;}
    const indented = /^\s/.test(line);

    // A block list may sit at column 0 under its key, as YAML allows.
    const item = line.match(/^(\s*)-(?:\s+(.*))?$/);
    if (item && (indented || inPackages)) {
      if (inPackages) {
        const value = item[2] === undefined ? null : scalar(item[2]);
        if (value === null) {out.skippedLines.push(raw.trim());}
        else {(out.packages ??= []).push(value);}
      }
      continue;
    }
    if (indented) {
      if (inPackages) {out.skippedLines.push(raw.trim());}
      continue;
    }

    inPackages = false;
    const key = line.match(TOP_KEY);
    if (!key) {
      out.skippedLines.push(raw.trim());
      continue;
    }
    const name = (key[1] ?? key[2] ?? key[3] ?? "").trim();
    const rest = key[4]!.trim();
    if (name !== "packages") {
      if (!out.skippedKeys.includes(name)) {out.skippedKeys.push(name);}
      continue;
    }
    if (rest === "") {
      inPackages = true;
      out.packages ??= [];
      continue;
    }
    const flow = rest.match(/^\[(.*)\]$/);
    if (!flow) {
      out.skippedLines.push(raw.trim());
      continue;
    }
    out.packages ??= [];
    for (const part of splitFlow(flow[1]!)) {
      if (part.trim() === "") {continue;}
      const value = scalar(part);
      if (value === null) {out.skippedLines.push(part.trim());}
      else {out.packages.push(value);}
    }
  }
  return out;
}

// ── Globs ────────────────────────────────────────────────────────────────────

// `./apps/x/` → `apps/x`, and `apps/x/package.json` → `apps/x`: the directory a pattern names.
export function normalizePattern(glob: string): string {
  let p = glob.trim().replace(/\\/g, "/");
  while (p.startsWith("./")) {p = p.slice(2);}
  p = p.replace(/\/package\.json$/, "").replace(/\/+$/, "");
  return p === "" ? "." : p;
}

function segmentRegExp(seg: string): RegExp {
  let re = /^[*?]/.test(seg) ? "(?!\\.)" : "";
  for (const c of seg) {
    if (c === "*") {re += "[^/]*";}
    else if (c === "?") {re += "[^/]";}
    else {re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");}
  }
  return new RegExp(`^${re}$`);
}

function matchSegments(pattern: Array<string>, path: Array<string>): boolean {
  if (pattern.length === 0) {return path.length === 0;}
  const [head, ...rest] = pattern;
  if (head === "**") {
    for (let k = 0; k <= path.length; k++) {
      if (k > 0 && path[k - 1]!.startsWith(".")) {return false;}
      if (matchSegments(rest, path.slice(k))) {return true;}
    }
    return false;
  }
  return path.length > 0 && segmentRegExp(head!).test(path[0]!) && matchSegments(rest, path.slice(1));
}

/**
 * Does a workspace pattern match a repo-relative directory? `*` is one path
 * segment, `**` any number of them, `?` one character. A wildcard never matches
 * a segment that starts with `.`, as package managers' globs don't.
 */
export function globMatch(glob: string, dir: string): boolean {
  return matchSegments(normalizePattern(glob).split("/"), dir.split("/"));
}

/** Directories matched by an include pattern and by no `!` pattern. `.` (the root) is never matched. */
export function matchWorkspaces(patterns: Array<string>, dirs: Array<string>): Array<string> {
  const include = patterns.filter((p) => !p.startsWith("!") && normalizePattern(p) !== ".");
  const exclude = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
  return dirs.filter((d) => include.some((p) => globMatch(p, d)) && !exclude.some((p) => globMatch(p, d)));
}
