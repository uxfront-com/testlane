<script setup lang="ts">
/**
 * Replaces Docus's menu toggle (docus/app/components/IconMenuToggle.vue, Docus
 * 5.13.0), the button that opens the docs header's menu below 1024px. Docus's
 * only draws three lines, so it has no name (axe's button-name), and it
 * animates them with motion-v, which isn't the app's to import. This one is
 * named like Nuxt UI's own toggle, says whether the menu is open, and turns
 * its lines into a cross with a CSS transition, which reduced motion skips.
 */
defineProps<{
	open: boolean;
}>();
</script>

<template>
	<UButton
		size="sm"
		variant="ghost"
		color="neutral"
		class="-me-1.5"
		square
		:aria-label="open ? 'Close menu' : 'Open menu'"
		:aria-expanded="open"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="menu-toggle size-5"
			:class="{ 'menu-toggle--open': open }"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<line x1="4" y1="6" x2="20" y2="6" />
			<line x1="4" y1="12" x2="20" y2="12" />
			<line x1="4" y1="18" x2="20" y2="18" />
		</svg>
	</UButton>
</template>

<style scoped>
.menu-toggle line {
	transform-box: view-box;
	transform-origin: 12px 12px;
	transition:
		transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1),
		opacity 0.2s ease;
}

.menu-toggle--open line:nth-child(1) {
	transform: rotate(45deg) translateY(6px);
}

.menu-toggle--open line:nth-child(2) {
	opacity: 0;
}

.menu-toggle--open line:nth-child(3) {
	transform: rotate(-45deg) translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
	.menu-toggle line {
		transition: none;
	}
}
</style>
