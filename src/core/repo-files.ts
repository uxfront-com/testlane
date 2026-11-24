// The two `RepoFiles` adapters `config detect` reads through (§9.12): a local
// directory, read with `node:fs` only (no git: a checkout's git config can run
// `core.fsmonitor`), and a commit in the primary bare repo, read with
// `git ls-tree` and `git cat-file`, with no worktree, fetch or ref change.

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { TestlaneError, configError } from "../lib/errors.ts";
import { capture } from "../lib/proc.ts";
import { gitEnv } from "../git/env.ts";
import { MAX_BLOB_BYTES, prefetchBlobs, readBlob } from "../git/repo.ts";
import type { RepoFiles } from "../config/detect.ts";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

function decode(bytes: Buffer, label: string): string {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {throw configError(`${label} is not valid UTF-8`);}
  return text.replace(/^﻿/, "");
}

/**
 * A directory on disk. Lists regular files only, never follows a symlink, and
 * never reads outside `root`.
 */
export function localFiles(root: string): RepoFiles {
  const base = resolve(root);
  let cache: string[] | undefined;

  const walk = (dir: string, out: string[]): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable: as if empty
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) {walk(join(dir, e.name), out);}
      } else if (e.isFile()) {
        out.push(relative(base, join(dir, e.name)).split(sep).join("/"));
      }
    }
  };

  const inside = (path: string): string | null => {
    if (path === "" || path.startsWith("/") || path.split("/").some((s) => s === ".." || s === "")) {return null;}
    return join(base, ...path.split("/"));
  };

  return {
    list: async () => {
      if (!cache) {
        cache = [];
        walk(base, cache);
        cache.sort();
      }
      return cache;
    },
    read: async (path) => {
      const abs = inside(path);
      if (!abs) {return null;}
      // Every segment must be a real directory or file, never a symlink.
      let cur = base;
      for (const seg of path.split("/")) {
        cur = join(cur, seg);
        let st;
        try {
          st = lstatSync(cur);
        } catch {
          return null;
        }
        if (st.isSymbolicLink()) {return null;}
        if (cur === abs) {
          if (!st.isFile()) {return null;}
          if (st.size > MAX_BLOB_BYTES) {throw configError(`${path} is larger than ${MAX_BLOB_BYTES} bytes`);}
        }
      }
      return decode(readFileSync(abs), path);
    },
    exists: async (path) => {
      const abs = inside(path);
      if (!abs) {return false;}
      try {
        return lstatSync(abs).isFile();
      } catch {
        return false;
      }
    },
  };
}

/**
 * A commit in a bare repo: one `git ls-tree -r` lists it, and each read is one
 * `git cat-file`, capped at 1 MiB as the trust gate's reads are. A partial
 * clone downloads the blobs it reads, in one fetch for what `prefetch` names;
 * nothing else in the repo changes.
 */
export function gitFiles(repoPath: string, ref: string): RepoFiles {
  let index: Map<string, string> | undefined;

  const load = async (): Promise<Map<string, string>> => {
    if (index) {return index;}
    const res = await capture(["git", "-C", repoPath, "ls-tree", "-r", "-z", "--full-tree", ref], {
      allowFailure: true,
      env: gitEnv(),
      errCode: "E_GIT",
    });
    if (res.code !== 0) {throw new TestlaneError("E_GIT", `git ls-tree failed for ${ref}: ${res.stderr.trim()}`);}
    index = new Map();
    for (const line of res.stdout.split("\0")) {
      const m = line.match(/^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s);
      if (!m) {continue;}
      const [, mode, type, id, path] = m;
      if (type !== "blob" || (mode !== "100644" && mode !== "100755")) {continue;}
      if (path!.split("/").some((s) => SKIP_DIRS.has(s))) {continue;}
      index.set(path!, id!);
    }
    return index;
  };

  return {
    list: async () => [...(await load()).keys()].sort(),
    read: async (path) => {
      const id = (await load()).get(path);
      if (id === undefined) {return null;}
      return decode(await readBlob(repoPath, id, `${path} on ${ref}`), `${path} on ${ref}`);
    },
    exists: async (path) => (await load()).has(path),
    prefetch: async (paths) => {
      const files = await load();
      await prefetchBlobs(repoPath, paths.flatMap((p) => files.get(p) ?? []));
    },
  };
}
