import { GITHUB_URL } from "./data/site";

export default defineAppConfig({
	// The docs' GitHub, "Edit this page" and "Report an issue" links. Docus reads
	// them from the git remote otherwise, which not every checkout has. The docs
	// live in apps/docs/content/, not at the root.
	github: {
		url: GITHUB_URL,
		branch: "main",
		rootDir: "apps/docs",
	},
	seo: {
		description:
			"Run any pull request, branch or commit locally, in a workspace of its own, with one command.",
	},
	docsTheme: {
		// Signs the header's site name "by UXFront", like the homepage header. With
		// no wordmark, the name stays Docus's plain title, as the homepage writes it.
		byline: true,
		// The docs header's links, beside its buttons from 768px up and at the top
		// of its menu below that.
		headerLinks: [
			// The introduction, rather than /docs, which only redirects to it.
			{
				label: "Docs",
				to: "/docs/getting-started/introduction",
				activeFor: "/docs",
			},
			{
				label: "GitHub",
				to: GITHUB_URL,
				icon: "i-simple-icons-github",
				target: "_blank",
			},
		],
	},
	ui: {
		colors: {
			// The green of the lanes the homepage's formation draws (see app/app.css
			// for its shades).
			primary: "green",
			neutral: "zinc",
		},
		prose: {
			// WCAG 1.4.3: Nuxt UI writes a callout's text, links and inline code in
			// its colour's 600 shade (500 for links), which fails AA on the callout's
			// tinted background in light mode, by far the most for `::warning`'s
			// yellow (2.75:1). The 800 shade passes on every colour. Dark mode keeps
			// Nuxt UI's shades, which pass.
			// Spelled out, since Tailwind only generates the classes it finds whole.
			callout: {
				variants: {
					color: {
						primary: {
							base: "text-primary-800 [&_a]:text-primary-800 [&_code]:text-primary-800 dark:text-primary-300 dark:[&_a]:text-primary dark:[&_code]:text-primary-300",
							externalIcon: "text-primary-800 dark:text-primary-300",
						},
						success: {
							base: "text-success-800 [&_a]:text-success-800 [&_code]:text-success-800 dark:text-success-300 dark:[&_a]:text-success dark:[&_code]:text-success-300",
							externalIcon: "text-success-800 dark:text-success-300",
						},
						info: {
							base: "text-info-800 [&_a]:text-info-800 [&_code]:text-info-800 dark:text-info-300 dark:[&_a]:text-info dark:[&_code]:text-info-300",
							externalIcon: "text-info-800 dark:text-info-300",
						},
						warning: {
							base: "text-warning-800 [&_a]:text-warning-800 [&_code]:text-warning-800 dark:text-warning-300 dark:[&_a]:text-warning dark:[&_code]:text-warning-300",
							externalIcon: "text-warning-800 dark:text-warning-300",
						},
						error: {
							base: "text-error-800 [&_a]:text-error-800 [&_code]:text-error-800 dark:text-error-300 dark:[&_a]:text-error dark:[&_code]:text-error-300",
							externalIcon: "text-error-800 dark:text-error-300",
						},
					},
				},
			},
			// WCAG 1.4.1 Use of Color: Nuxt UI's prose link is the primary colour
			// with a bottom border that only shows on hover, so a link in a
			// sentence is told apart by colour alone. The green measures about
			// 1:1 against the body text, far under the 3:1 a colour-only link
			// needs, so the border shows at rest, in the link's own colour.
			a: {
				base: "border-current",
			},
		},
	},
});
