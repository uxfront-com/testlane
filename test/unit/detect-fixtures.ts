// File maps that copy the shape of five public repos, for `config detect`
// (§9.12, §17.1). Only the files the rules read are here, plus a few they must
// ignore. Values are illustrative, not copies.

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** F1: a pnpm + turbo monorepo with a Nuxt app in apps/web (uxfront, unframework). */
export const F1_PNPM_TURBO: Record<string, string> = {
  "package.json": json({
    name: "uxfront",
    private: true,
    packageManager: "pnpm@11.25.0",
    scripts: {
      dev: "turbo run dev",
      build: "turbo run build",
      test: "turbo run test",
      lint: "eslint .",
      "format:check": "prettier --check .",
      "check-types": "turbo run check-types",
    },
    devDependencies: { turbo: "^2.5.0" },
  }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": [
    "packages:",
    '  - "apps/*"',
    "  - packages/*",
    "  - '!packages/old'",
    "",
    "allowBuilds:",
    "  esbuild: true",
    "",
  ].join("\n"),
  "turbo.json": json({ tasks: { build: { dependsOn: ["^build"] } } }),
  "apps/web/package.json": json({
    name: "web",
    private: true,
    scripts: { dev: "nuxt dev", build: "nuxt build", postinstall: "nuxt prepare" },
    dependencies: { nuxt: "^4.0.0", "@uxfront/ui": "workspace:*" },
  }),
  "apps/web/.env.example": "NUXT_PUBLIC_SITE_URL=\n",
  "packages/ui/package.json": json({
    name: "@uxfront/ui",
    scripts: { dev: "vite build --watch", build: "vite build" },
    devDependencies: { vite: "^7.0.0" },
  }),
  "packages/old/package.json": json({ name: "@uxfront/old", scripts: { dev: "vite" } }),
};

/** F2: a single Nuxt app with `.env.example` and a postinstall (open-components). */
export const F2_SINGLE_NUXT: Record<string, string> = {
  "package.json": json({
    name: "open-components",
    private: true,
    packageManager: "pnpm@10.33.4",
    scripts: {
      dev: "nuxt dev",
      build: "nuxt build",
      postinstall: "nuxt prepare",
      test: "vitest run",
      "check-types": "vue-tsc --noEmit",
      "check-reference": "node scripts/check-reference.mjs",
    },
    dependencies: { nuxt: "^4.1.0" },
  }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": "allowBuilds:\n  better-sqlite3: true\n",
  ".env.example": "NUXT_UI_PRO_LICENSE=\n",
};

/** F3: an npm root with a pnpm docs app (testlane). */
export const F3_NPM_ROOT_PNPM_DOCS: Record<string, string> = {
  "package.json": json({
    name: "@uxfront/testlane",
    type: "module",
    repository: { type: "git", url: "git+https://github.com/uxfront-com/testlane.git" },
    scripts: {
      build: "tsc -p tsconfig.build.json",
      dev: "npm run build && node dist/bin/testlane.js",
      test: "vitest run",
      typecheck: "tsc --noEmit",
    },
    dependencies: { "smol-toml": "^1.3.1", zod: "^3.24.1" },
  }),
  "package-lock.json": json({ lockfileVersion: 3 }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": [
    "packages:",
    "  - '.'",
    "  - apps/*",
    "",
    "allowBuilds:",
    "  sharp: true",
    "",
    "catalog:",
    "  vue: ^3.5.0",
    "",
    "catalogs:",
    "  nuxt:",
    "    nuxt: ^4.0.0",
    "",
  ].join("\n"),
  "apps/docs/package.json": json({
    name: "@uxfront/docs",
    private: true,
    scripts: { dev: "nuxt dev", build: "nuxt build" },
    dependencies: { nuxt: "catalog:nuxt" },
  }),
};

/** F4: a Nuxt docs app, a second Nuxt app, a Vite playground and Storybook, with `conductor.toml` (styleframe). */
export const F4_MANY_APPS: Record<string, string> = {
  "package.json": json({
    name: "styleframe-monorepo",
    private: true,
    packageManager: "pnpm@10.20.0",
    scripts: {
      dev: "turbo run dev",
      build: "turbo run build",
      "build:nodocs": "turbo run build --filter=!@styleframe/docs",
      test: "turbo run test",
      lint: "eslint .",
      "format:check": "prettier --check .",
      typecheck: "turbo run typecheck",
    },
    devDependencies: { turbo: "^2.5.0" },
  }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": [
    "packages:",
    "  - config/**",
    "  - apps/**",
    "  - engine/**",
    "  - theme",
    "  - testing/**",
    "  - tooling/**",
    "",
    "catalog:",
    "  typescript: ^5.9.0",
    "",
  ].join("\n"),
  "turbo.json": json({ tasks: { build: { dependsOn: ["^build"] } } }),
  "conductor.toml": '[scripts]\nsetup = "pnpm install && pnpm build"\nrun = "pnpm run dev:docs"\n',
  "apps/docs/package.json": json({
    name: "@styleframe/docs",
    scripts: { dev: "nuxt dev" },
    dependencies: { nuxt: "^4.0.0" },
  }),
  "apps/docs/.env.example": "NUXT_PUBLIC_SITE_URL=\n",
  "apps/app/package.json": json({
    name: "@styleframe/app",
    scripts: { dev: "nuxt dev --port 4000" },
    dependencies: { nuxt: "^4.0.0" },
  }),
  "apps/app/.env.example": "DATABASE_URL=\n",
  "apps/playground/package.json": json({
    name: "@styleframe/playground",
    scripts: { dev: "vite" },
    devDependencies: { vite: "^7.0.0" },
  }),
  "apps/storybook/package.json": json({
    name: "@styleframe/storybook",
    scripts: { dev: "storybook dev -p 6006" },
    devDependencies: { storybook: "^9.0.0", "@storybook/vue3-vite": "^9.0.0" },
  }),
  "apps/shared/package.json": json({ name: "@styleframe/shared", scripts: { build: "tsc" } }),
  "engine/core/package.json": json({
    name: "@styleframe/core",
    scripts: { dev: "vite build --watch" },
    devDependencies: { vite: "^7.0.0" },
  }),
};

/** F5: a pnpm monorepo driven by vite-plus `vp` (inkline). */
export const F5_VITE_PLUS: Record<string, string> = {
  "package.json": json({
    name: "inkline-monorepo",
    private: true,
    packageManager: "pnpm@11.6.0",
    scripts: {
      dev: "vp run website#dev",
      build: "vp run -r build",
      check: "vp check",
      typecheck: "vp run -r typecheck",
      test: "vp run -r test",
    },
    devDependencies: { "vite-plus": "^0.1.0" },
  }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": [
    "packages:",
    "  - apps/*",
    "  - core/*",
    "  - ui/*",
    "",
    "allowBuilds:",
    "  esbuild: true",
    "",
    "minimumReleaseAgeExclude:",
    "  - '@uxfront/*'",
    "",
  ].join("\n"),
  "apps/docs/package.json": json({
    name: "website",
    private: true,
    scripts: { dev: "nuxt dev", build: "nuxt build" },
    dependencies: { nuxt: "^4.0.0" },
  }),
  "apps/storybook/package.json": json({ name: "@inkline/storybook", scripts: { build: "storybook build" } }),
  "core/compiler/package.json": json({ name: "@inkline/compiler", scripts: { dev: "vp pack --watch" } }),
  ".old/turbo.json": json({ tasks: {} }),
  ".old/pnpm-workspace.yaml": "packages:\n  - legacy/*\n",
  ".old/package.json": json({ name: "old", scripts: { dev: "nuxt dev" } }),
};

export const FIXTURES = {
  F1: F1_PNPM_TURBO,
  F2: F2_SINGLE_NUXT,
  F3: F3_NPM_ROOT_PNPM_DOCS,
  F4: F4_MANY_APPS,
  F5: F5_VITE_PLUS,
} as const;
