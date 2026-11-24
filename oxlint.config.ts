import vue from "@uxfront/oxlint-config/vue";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [vue],
  // oxlint reads these two only from the root config, so they're restated here.
  env: vue.env,
  ignorePatterns: [...vue.ignorePatterns],
  rules: {
    // Baseline for 0.2.0: each rule that fails here today is off, and the commits that follow
    // turn them on one by one.
    "no-console": "off",
    "no-promise-executor-return": "off",
    "quality/no-array-filter-map": "off",
    "quality/no-conditional-empty-object-spread": "off",
    "quality/no-known-value-widening": "off",
    "quality/no-object-parameters": "off",
    "quality/no-unknown-returns": "off",
    "quality/no-unsafe-dictionary-type": "off",
    "typescript/no-non-null-assertion": "off",
    "unicorn/consistent-function-scoping": "off",
  },
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
