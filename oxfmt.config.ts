import base from "@uxfront/oxfmt-config";
import { defineConfig } from "oxfmt";

export default defineConfig({
  ...base,
  ignorePatterns: [
    ...(base.ignorePatterns ?? []),
    // The docs pages are MDC, which a Markdown formatter rewrites: it moves the content of
    // component blocks out of their indentation and changes the example code inside them.
    // CHANGELOG.md and .changeset/ belong to Changesets.
    "**/*.md",
  ],
});
