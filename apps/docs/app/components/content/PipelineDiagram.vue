<script setup lang="ts">
/**
 * The resolve → materialize → act pipeline, as a diagram for the docs pages:
 * `::pipeline-diagram` on the Introduction, `::pipeline-diagram{variant="detail"}`
 * on How it works. It's plain HTML, so it's in the prerendered page and needs
 * no JavaScript. The steps are an ordered list, so a screen reader reads them
 * in order, and the arrows between them are decoration. Each list keeps
 * `role="list"`, since Safari drops the role of a list with no markers. Colours come from
 * Nuxt UI's tokens, so it follows the site's light and dark mode. It lays the
 * steps out by the width of the content column, not the screen: in a row when
 * the column has room, stacked when it doesn't.
 */
import {
	PIPELINE_REFS,
	PIPELINE_STEPS,
	PIPELINE_SUBSTEPS,
	PIPELINE_VERBS,
	type PipelineVariant,
} from "~/data/pipeline";

const props = withDefaults(defineProps<{ variant?: PipelineVariant }>(), {
	variant: "compact",
});

const detail = computed(() => props.variant === "detail");
const steps = [PIPELINE_STEPS.resolve, PIPELINE_STEPS.materialize, PIPELINE_STEPS.act];
</script>

<template>
	<figure class="pipeline" data-diagram="pipeline" :data-variant="detail ? 'detail' : 'compact'">
		<ol class="pipeline-steps" role="list">
			<li v-for="(step, index) in steps" :key="step.name" class="pipeline-step">
				<div class="pipeline-card">
					<p class="pipeline-head">
						<span class="pipeline-number">{{ index + 1 }}</span>
						<span class="pipeline-name">{{ step.name }}</span>
					</p>
					<p class="pipeline-call"><code>{{ step.call }}</code></p>
					<p class="pipeline-caption">{{ step.caption }}</p>

					<template v-if="detail">
						<ul v-if="index === 0" class="pipeline-refs" role="list">
							<li v-for="item in PIPELINE_REFS" :key="item.kind">
								<span class="pipeline-label">{{ item.label }}</span>
								<span class="pipeline-mapping">
									<code>{{ item.shownRef ?? item.ref }}</code>
									<span class="pipeline-to" aria-hidden="true">→</span>
									<span class="sr-only">gets the slug</span>
									<code>{{ item.slug }}</code>
								</span>
							</li>
						</ul>

						<ol v-else-if="index === 1" class="pipeline-substeps" role="list">
							<li
								v-for="substep in PIPELINE_SUBSTEPS"
								:key="substep.name"
								:class="{ 'is-conditional': substep.when }"
							>
								<span class="pipeline-label">{{ substep.name }}</span>
								<span v-if="substep.when" class="pipeline-when">{{ substep.when }}</span>
							</li>
						</ol>

						<ul v-else class="pipeline-verbs" role="list">
							<li v-for="verb in PIPELINE_VERBS" :key="verb">
								<code>{{ verb }}</code>
							</li>
						</ul>
					</template>
				</div>

				<span v-if="index < steps.length - 1" class="pipeline-arrow" aria-hidden="true">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M5 12h14M13 6l6 6-6 6" />
					</svg>
				</span>
			</li>
		</ol>

		<figcaption class="pipeline-figcaption">
			<template v-if="detail">
				The three steps in detail. A dashed sub-step doesn't run every time.
			</template>
			<template v-else>
				Every command that opens a workspace runs these three steps, in order.
			</template>
		</figcaption>
	</figure>
</template>

<style scoped>
.pipeline {
	container-type: inline-size;
	margin-block: 1.5rem;
}

.pipeline-steps {
	display: flex;
	flex-direction: column;
	gap: 2.25rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.pipeline-step {
	position: relative;
	display: flex;
	min-width: 0;
}

.pipeline-card {
	flex: 1;
	min-width: 0;
	padding: 1rem;
	border: 1px solid var(--ui-border-accented);
	border-radius: calc(var(--ui-radius) * 2);
	background: var(--ui-bg);
	color: var(--ui-text-toned);
	font-size: 0.875rem;
	line-height: 1.5;
}

.pipeline-head {
	margin: 0;
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.pipeline-number {
	display: inline-grid;
	place-items: center;
	flex: none;
	width: 1.5rem;
	height: 1.5rem;
	border: 1px solid currentColor;
	border-radius: 999px;
	color: var(--ui-primary);
	font-size: 0.75rem;
	font-weight: 600;
}

.pipeline-name {
	color: var(--ui-text-highlighted);
	font-size: 1rem;
	font-weight: 600;
}

.pipeline code {
	font-family: var(--font-mono, ui-monospace, monospace);
	font-size: 0.8125rem;
	overflow-wrap: anywhere;
}

.pipeline-call {
	margin: 0.25rem 0 0;
	color: var(--ui-text-toned);
}

.pipeline-caption {
	margin: 0.5rem 0 0;
}

/* The detailed view's lists, under the caption. */
.pipeline-refs,
.pipeline-substeps,
.pipeline-verbs {
	margin: 0.75rem 0 0;
	padding: 0.75rem 0 0;
	border-top: 1px solid var(--ui-border);
	list-style: none;
}

.pipeline-label {
	color: var(--ui-text-highlighted);
	font-weight: 500;
}

.pipeline-refs {
	display: grid;
	gap: 0.5rem;
}

.pipeline-refs li {
	display: grid;
}

.pipeline-mapping {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	column-gap: 0.375rem;
}

.pipeline-to {
	color: var(--ui-text-toned);
}

/* Materialize's sub-steps, joined by a line, in the order they run. A sub-step
   that doesn't always run has a dashed marker and says when it runs. */
.pipeline-substeps {
	display: grid;
	gap: 0.5rem;
}

.pipeline-substeps li {
	position: relative;
	display: grid;
	padding-left: 1.25rem;
}

.pipeline-substeps li::before {
	content: "";
	position: absolute;
	top: 0.4rem;
	left: 0;
	width: 0.625rem;
	height: 0.625rem;
	border: 2px solid var(--ui-primary);
	border-radius: 999px;
	background: var(--ui-bg);
}

.pipeline-substeps li.is-conditional::before {
	border-style: dashed;
}

.pipeline-substeps li:not(:last-child)::after {
	content: "";
	position: absolute;
	top: 1.125rem;
	bottom: -0.625rem;
	left: 0.25rem;
	border-left: 2px solid var(--ui-border-accented);
}

.pipeline-when {
	font-size: 0.8125rem;
}

.pipeline-verbs {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
}

.pipeline-verbs code {
	display: inline-block;
	padding: 0.125rem 0.375rem;
	border: 1px solid var(--ui-border-accented);
	border-radius: var(--ui-radius);
	background: var(--ui-bg-elevated);
	color: var(--ui-text-highlighted);
}

/* The arrow to the next step: below the card while the steps stack. */
.pipeline-arrow {
	position: absolute;
	top: 100%;
	left: 50%;
	display: grid;
	place-items: center;
	width: 2.25rem;
	height: 2.25rem;
	color: var(--ui-text-toned);
	transform: translateX(-50%) rotate(90deg);
}

.pipeline-figcaption {
	margin-top: 0.75rem;
	color: var(--ui-text-toned);
	font-size: 0.875rem;
	text-align: center;
}

/* In a row once the column fits three cards side by side. */
@container (min-width: 36rem) {
	.pipeline-steps {
		flex-direction: row;
		gap: 2rem;
	}

	.pipeline-step {
		flex: 1 1 0;
	}

	.pipeline-arrow {
		top: 1rem;
		left: 100%;
		width: 2rem;
		height: 1.5rem;
		transform: none;
	}
}
</style>
