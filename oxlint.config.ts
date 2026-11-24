import vue from "@uxfront/oxlint-config/vue";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [vue],
  // oxlint reads these two only from the root config, so they're restated here.
  env: vue.env,
  ignorePatterns: [...vue.ignorePatterns],
  rules: {
    // It flags each explicit Record<string, T> and inline return type. Testlane's dictionaries
    // are lookup tables read by any string key (signal names, duration units, characters to
    // escape, environment variables), and functions state the type they return. Inferring
    // instead would need a cast at each lookup and hide the contract each function promises.
    "quality/no-known-value-widening": "off",
  },
  overrides: [
    {
      files: ["test/**", "apps/docs/test/**"],
      rules: {
        // Test helpers live in the describe block whose tests use them, and blocks define their
        // own helper of the same name (originMain, repoState). The rule stays on in src/.
        "unicorn/consistent-function-scoping": "off",
      },
    },
    {
      files: [
        "src/commands/config.ts",
        "src/config/detect-emit.ts",
        "src/config/detect.ts",
        "src/core/trust.ts",
        "src/mcp/**",
        "test/**",
        "apps/docs/app/data/schema.ts",
        "apps/docs/test/**",
      ],
      rules: {
        // These files read untrusted JSON and TOML (MCP requests, package.json, config files and
        // drafts, the CLI's own --json output in tests) as Record<string, unknown>, then check
        // each field before they use it. That type is the boundary: it promises nothing about
        // a value until a check narrows it. The rule stays on everywhere else.
        "quality/no-unsafe-dictionary-type": "off",
      },
    },
    {
      files: ["src/**", "test/**", "apps/docs/server/**"],
      rules: {
        // With noUncheckedIndexedAccess on, `!` marks a value the code has already checked in a
        // way the types can't follow: an index inside its loop's bounds, a capture group of a
        // regex that matched, the stdout of a child spawned with piped stdio, a field a filter
        // kept. A runtime check there could never fail, and no test could reach it.
        "typescript/no-non-null-assertion": "off",
      },
    },
    {
      files: [
        "src/commands/clone-detect.ts",
        "src/commands/config.ts",
        "src/commands/setup.ts",
        "src/config/detect.ts",
        "src/mcp/tools.ts",
        "test/mcp-client.ts",
        "test/unit/detect.test.ts",
      ],
      rules: {
        // These files build each object as one literal that goes straight into a call, a return
        // or JSON.stringify (a TOML view, a JSON schema, a JSON-RPC message), and leave out an
        // optional field with a conditional spread. Separate statements would turn each literal
        // into a mutable variable and an if, for no gain here. The rule stays on everywhere else.
        "quality/no-conditional-empty-object-spread": "off",
      },
    },
    {
      files: ["bin/testlane.ts", "apps/docs/scripts/**"],
      rules: {
        // Command-line entry points: the console is their output. The CLI writes through its
        // own streams everywhere else, so the rule stays on there.
        "no-console": "off",
      },
    },
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
