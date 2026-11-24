import vue from "@uxfront/oxlint-config/vue";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [vue],
  overrides: [
    {
      files: [
        "src/commands/config.ts",
        "src/config/detect-emit.ts",
        "src/core/resolve.ts",
        "test/unit/trust.test.ts",
      ],
      rules: {
        // These files find control characters on purpose: they escape them before a terminal or
        // a TOML file sees them, reject them in ref names and clone URLs as git does, and test
        // that none reach the output. The rule stays on everywhere else.
        "no-control-regex": "off",
      },
    },
  ],
});
