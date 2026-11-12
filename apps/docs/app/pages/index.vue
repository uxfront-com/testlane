<script setup lang="ts">
import { hold } from "@uxfront/scene";
import { corridor, outline } from "@uxfront/scene/formations";

import { DOCS_URL, GITHUB_URL, UXFRONT_URL } from "~/data/site";
import { lanes } from "~/lib/formations/lanes";
import { spotlight } from "~/lib/formations/spotlight";

useUxHead({
	title: "Testlane - Run any pull request or branch locally, in one command",
	description:
		"Point Testlane at a pull request, a branch, a commit or a link. You get the code checked out, dependencies installed and a port of your own, while everything you already had open stays untouched.",
	siteName: "Testlane",
	image: {
		path: "/og.jpg",
		width: 1200,
		height: 630,
		alt: "A stream of white light that four refs branch off, each into a lane of its own that ends in a lit workspace with its port, beside the words: any git ref, running locally in one command.",
	},
	sameAs: [GITHUB_URL],
});

// The lanes tell the story: one stream of light (the repository) that refs
// branch off, each into a lane of its own that ends in a lit workspace. The
// hero shows all of it, the first chapter turns it to follow a ref down its
// lane, and the third closes in on the workspaces, side by side. The chapters
// with a code panel gather the particles around it, and the finale is the
// corridor of light the other UXFront sites close on.
const hero = hold(
	lanes({
		key: "hero",
		label: "Testlane",
		views: {
			desktop: {
				target: [1.1, 0, 0],
				span: [4.2, 1.6],
				shift: [0.34, 0.04],
			},
			mobile: { target: [1.1, 0, 0], span: [3, 1.1] },
		},
	}),
	1,
);
const pipeline = hold(
	lanes({
		key: "pipeline",
		label: "Pipeline",
		views: {
			desktop: {
				eye: [-4.5, 2.4, 8.5],
				target: [0.2, 0, 0],
				span: [3.4, 1.3],
				shift: [-0.4, 0.02],
			},
			mobile: { eye: [-3, 2, 10], target: [0.8, 0, 0], span: [2.8, 1.2] },
		},
	}),
	1,
);
const refs = outline({ key: "refs", label: "Refs" });
const isolation = spotlight(
	hold(
		lanes({
			key: "isolation",
			label: "Isolation",
			views: {
				desktop: {
					eye: [3.6, 0.9, 6.5],
					target: [2.6, 0, 0],
					span: [1.6, 1.1],
					shift: [0.36, 0],
				},
				mobile: { eye: [3.4, 0.8, 7.5], target: [3.1, 0, 0], span: [2, 1.3] },
			},
		}),
		1,
	),
	1.7,
	20,
	// The lanes run in behind the copy: keep them faint so it stays legible.
	{ dim: 0.06 },
);
const environment = outline({ key: "environment", label: "Environment" });
const lifecycle = spotlight(
	hold(
		lanes({
			key: "lifecycle",
			label: "Lifecycle",
			views: {
				desktop: {
					eye: [2, -1.2, 10],
					target: [1.2, 0, 0],
					span: [3.4, 1.4],
					shift: [-0.36, 0.06],
				},
				mobile: { eye: [2, -1, 11], target: [1.4, 0, 0] },
			},
		}),
		1,
	),
	-20,
	20,
	// The six details below sit over the lanes: keep them faint.
	{ dim: 0.35, soft: 0.4 },
);
const requirements = spotlight(
	hold(
		lanes({
			key: "requirements",
			label: "Requirements",
			views: {
				desktop: {
					eye: [-3.4, 0.8, 7],
					target: [-3.6, 0, 0],
					span: [2.6, 1],
					shift: [0.3, 0],
				},
				mobile: { eye: [-3, 0.8, 8], target: [-3.2, 0, 0], span: [2.4, 1] },
			},
		}),
		1,
	),
	-20,
	-2.8,
	// The lanes fan out behind the copy: keep them faint so it stays legible.
	{ dim: 0.05 },
);
const scene = [
	hero,
	pipeline,
	refs,
	isolation,
	environment,
	lifecycle,
	requirements,
	corridor({ label: "Try it" }),
];

const chapters = {
	pipeline: {
		id: "pipeline",
		index: "01",
		role: "Pipeline",
		title: "Every command is the same three steps",
	},
	refs: { id: "refs", index: "02", role: "Refs", title: "Any ref you can name" },
	isolation: {
		id: "isolation",
		index: "03",
		role: "Isolation",
		title: "Run three at once, nothing collides",
	},
	environment: {
		id: "environment",
		index: "04",
		role: "Environment",
		title: "Your commands know where they are",
	},
	lifecycle: {
		id: "lifecycle",
		index: "05",
		role: "Lifecycle",
		title: "From opened to cleaned up",
	},
	requirements: {
		id: "requirements",
		index: "06",
		role: "Requirements",
		title: "Runs on the stack you already have",
	},
};

const nav = Object.values(chapters).map((chapter) => ({
	href: `#${chapter.id}`,
	label: chapter.role,
	index: chapter.index,
}));

// The four refs the lanes stand for, and the port each workspace gets.
const workspaces = [
	{ ref: "#42", port: "3053" },
	{ ref: "feat/login", port: "3011" },
	{ ref: "1a2b3c4", port: "3027" },
	{ ref: "main", port: "3040" },
];

const steps = [
	{
		title: "Resolve the ref",
		text: "You point at something: a pull request number, a branch, a commit or a link from chat. Testlane works out what you meant.",
	},
	{
		title: "Materialize the workspace",
		text: "A folder appears with the code checked out, dependencies installed, your local files copied in and a free port reserved. Ask again and you get the same folder back straight away.",
	},
	{
		title: "Act on it",
		text: "Open your editor, start the dev server, run a one-off command or print the path. Whatever you asked for, the workspace is ready before it runs.",
	},
];

const refKinds = [
	{
		title: "Six kinds of ref",
		text: "Pull request numbers, branch names, commit hashes, GitHub links, local paths, and a dash when you mean the one you were just on.",
	},
	{
		title: "Paste the link",
		text: "A GitHub link already says which project and which pull request. Paste it in and that is the entire command.",
	},
];

const refsCode = `testlane my-project 42            # pull request
testlane my-project feat/login    # branch
testlane my-project 1a2b3c4       # commit
testlane my-project - shell       # last used ref
testlane …/pull/42 code           # straight from a URL`;

const isolated = [
	{
		title: "A port of its own",
		text: "Every workspace gets its own free ports, and Testlane hands them to your commands. Ask for two if your app needs an API alongside it.",
	},
	{
		title: "The files git never sees",
		text: "Your local env file, a certificate, a scratch config: copied into every new workspace, and never written over one you already have.",
		href: "/docs/guides/seed-local-files",
	},
	{
		title: "Setup that remembers",
		text: "Dependencies install on the first checkout and stay installed. Testlane only runs them again when your lockfile changes.",
	},
];

const placeholders = [
	{
		title: "The details, handed over",
		text: "Everything Testlane runs for you is told the workspace's path, ports, branch and data directory. Anything you set yourself sits on top and wins.",
	},
	{
		title: "Write it once",
		text: "Drop a placeholder for the port, the path or the branch into any command, environment value or hook, and Testlane fills it in per workspace.",
		href: "/docs/configuration/environment-and-templates",
	},
	{
		title: "See it before you run it",
		text: "A dry run prints the exact environment and the exact command, then stops.",
	},
];

const configCode = `ports = 2

[setup]
run = "pnpm install --frozen-lockfile"
cache_key = ["pnpm-lock.yaml"]
seed_files = [".env.local"]

[env]
PORT = "{port}"
API_PORT = "{port+1}"`;

const lifespan = [
	{
		title: "One word per intent",
		text: "Open an editor, start a server, get a shell, read the diff. Each one sets the workspace up first.",
	},
	{
		title: "See the whole board",
		text: "One list of everything you have open: the branch, the port, its age and whether its pull request is still alive.",
	},
	{
		title: "Catch up without starting over",
		text: "Pull a workspace up to date with its branch. With uncommitted work in it, Testlane stops and tells you.",
	},
	{
		title: "Room for your own steps",
		text: "Start a container before the dev server, or drop a scratch database on the way out.",
		href: "/docs/configuration/commands-and-hooks",
	},
	{
		title: "Get the disk back",
		text: "Clear out the workspaces whose pull requests have merged or closed. Testlane asks first, and skips any with uncommitted work.",
	},
	{
		title: "Fine inside your own scripts",
		text: "The commands that produce data can print JSON instead, with progress kept out of the way.",
		href: "/docs/guides/script-with-testlane",
	},
];

const stack = [
	{ term: "Node and git", detail: "Node 18 or newer and git 2.38 or newer. Install it with npm, pnpm or yarn." },
	{ term: "GitHub CLI", detail: "Optional. With it you get pull request status, CI results and true pull request diffs." },
	{ term: "One file", detail: "Your commands, environment and hooks live in one TOML file per project, which Testlane can check for mistakes." },
];

const family = [
	{ href: "https://opencomponents.dev", name: "Open Components", meta: "Standard" },
	{ href: "https://unframework.dev", name: "Unframework", meta: "Compiler" },
	{ href: "https://styleframe.dev", name: "Styleframe", meta: "Styling engine" },
	{ href: UXFRONT_URL, name: "UXFront", meta: "Foundation" },
];
</script>

<template>
	<UxSite :scene="scene" skip-to="#pipeline" skip-label="Skip to how it works">
		<template #anchors>
			<!-- Refs are case-sensitive, so they keep their case in the uppercase labels. -->
			<UxAnchor
				v-for="(workspace, i) in workspaces"
				:key="`hero-${workspace.ref}`"
				:anchor="`hero:${i}`"
			>
				<span class="anchor-ref">{{ workspace.ref }}</span> :{{ workspace.port }}
			</UxAnchor>
			<UxAnchor
				v-for="(workspace, i) in workspaces"
				:key="`isolation-${workspace.ref}`"
				:anchor="`isolation:${i}`"
				variant="callout"
			>
				<b class="anchor-ref">{{ workspace.ref }}</b>
				<span class="anchor-detail">Port {{ workspace.port }}</span>
			</UxAnchor>
		</template>
		<template #header>
			<UxHeader
				brand="Testlane"
				:nav="nav"
				nav-label="How it works"
				:github="GITHUB_URL"
			>
				<template #mark />
				<template #brand>Testlane</template>
				<template #byline>
					by
					<a :href="UXFRONT_URL">
						<UxFrontMark />
						<span><strong>UX</strong>Front</span>
					</a>
				</template>
				<template #actions>
					<NuxtLink class="header-docs" :to="DOCS_URL">Documentation</NuxtLink>
				</template>
			</UxHeader>
		</template>

		<UxHero
			kicker="Resolve · materialize · act"
			title="Any git ref, running locally in one command"
			:index="nav"
			index-label="How it works"
			scroll-href="#pipeline"
		>
			<template #lines>
				<UxHeroLine>Any <strong>git ref</strong>,</UxHeroLine>
				<UxHeroLine>running locally</UxHeroLine>
				<UxHeroLine>in one command</UxHeroLine>
			</template>
			<template #lead>
				Point Testlane at a pull request, a branch or a link someone pasted in
				chat. You get the code checked out, dependencies installed and a port of
				your own, while the work you already have open stays where it is.
				<br />
				<span class="hero-actions">
					<UxPillLink variant="filled" :href="DOCS_URL" label="Get started" />
					<UxPillLink :href="GITHUB_URL" label="Star on GitHub" />
				</span>
			</template>
		</UxHero>

		<UxChapter v-bind="chapters.pipeline" :steps="3" align="end">
			<template #lead>
				Learn it once and the whole tool is predictable. There is no special
				case to remember.
			</template>
			<UxTraits :items="steps" />
		</UxChapter>

		<UxSplit v-bind="chapters.refs" :steps="2">
			<template #lead>
				If you can point at it, Testlane can run it. No cloning, no stashing,
				no "let me finish what I'm doing first".
			</template>
			<UxTraits :items="refKinds" />
			<template #aside>
				<UxCode title="Six ways to name the same thing" :code="refsCode" />
			</template>
		</UxSplit>

		<UxChapter v-bind="chapters.isolation" :steps="3">
			<template #lead>
				Three branches can run at the same time without fighting over a port, a
				node_modules folder or a database file.
			</template>
			<UxTraits :items="isolated" />
		</UxChapter>

		<UxSplit v-bind="chapters.environment" :steps="3">
			<template #lead>
				Paths, ports and your own variables are worked out before anything runs,
				so one command behaves the same in every workspace.
			</template>
			<UxTraits :items="placeholders" />
			<template #aside>
				<UxCode title="~/.testlane/my-project.toml" :code="configCode" />
			</template>
		</UxSplit>

		<UxChapter v-bind="chapters.lifecycle" :steps="6" align="end">
			<template #lead>
				A workspace has a lifespan. Testlane covers all of it, and clears up
				after itself at the end.
			</template>
			<UxTraits :items="lifespan" />
		</UxChapter>

		<UxChapter v-bind="chapters.requirements" :steps="3" align="end">
			<template #lead>No new runtime, no daemon, no account.</template>
			<UxSpec :items="stack" />
		</UxChapter>

		<UxFinale kicker="Part of UXFront" :cards="family">
			<template #title>
				Try it on the next <strong>pull request</strong> you review.
			</template>
			<template #lead>
				One setup command writes your config, scaffolds your first project and
				tells you what to run next.
			</template>
			<template #actions>
				<UxPillLink variant="filled" :href="DOCS_URL" label="Get started" />
				<UxPillLink href="/docs/cli/overview" label="CLI reference" />
				<UxPillLink :href="GITHUB_URL" label="Follow on GitHub" />
			</template>
			<template #footer>
				<span>© 2026 UXFront</span>
				<a :href="GITHUB_URL">GitHub</a>
			</template>
		</UxFinale>
	</UxSite>
</template>

<style scoped>
/* The first frame only has the components' inline styles (Tailwind loads after
   it), so the hero's links are styled here rather than with utilities. */
.hero-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	margin-top: 2rem;
}

.anchor-ref {
	text-transform: none;
}

/* The callout's own detail line, which the slot replaces: sans, and hidden
   where the formation stacks above the copy, as UxAnchor hides it. */
.anchor-detail {
	font-family: var(--font-ux-sans);
	letter-spacing: 0;
	text-transform: none;
}

@media (max-width: 1099px), (max-aspect-ratio: 5/4) {
	.anchor-detail {
		display: none;
	}
}

/* Phones can't fit the byline beside both header links. The hero links to the
   docs just below. */
@media (max-width: 639px) {
	.header-docs {
		display: none;
	}
}
</style>
