<!--
  A copy of Docus's docs page (docus/app/pages/[[lang]]/[...slug].vue, Docus
  5.13.0) with these changes:

  - The separator above "Edit this page" and "Report an issue" is decorative,
    since it holds those links.
  - The head is the app's own, in place of Docus's `useSeo`: a `TechArticle`
    with the page's date and Open Graph image, published by UXFront, rather
    than an `Article` published by an Organization named after the site (audit
    S2), and breadcrumbs whose items are all pages, not group paths that only
    redirect (S3). It adds `twitter:title`, `twitter:description` and a link to
    the page's Markdown copy (G2, A4).
  - The Open Graph card gets its alt text, and the whole description, commas
    included. Docus drops the commas and cuts the description to keep the
    card's URL under nuxt-og-image's length limit, but over that limit a
    prerendered card's URL becomes a hash, so nothing needs cutting.

  Keep the rest in step with Docus's when it's upgraded.
-->
<script setup lang="ts">
import { kebabCase } from 'scule'
import type { ContentNavigationItem, Collections, DocsCollectionItem } from '@nuxt/content'
import { findPageHeadline } from '@nuxt/content/utils'
import { GIT_DATES } from '#build/git-dates.mjs'
import { breadcrumbList, techArticle } from '~/data/schema'
import { DOCS_OG_IMAGE_ALT, SITE_URL } from '~/data/site'

definePageMeta({
  layout: 'docs',
})

const route = useRoute()
const { locale, isEnabled, t } = useDocusI18n()
const { isOpen } = useAssistant()
const appConfig = useAppConfig()
const navigation = inject<Ref<Array<ContentNavigationItem>>>('navigation')
const collectionName = computed(() => isEnabled.value ? `docs_${locale.value}` : 'docs')

const [{ data: page }, { data: surround }] = await Promise.all([
  useAsyncData(kebabCase(route.path), () => queryCollection(collectionName.value as keyof Collections).path(route.path).first() as Promise<DocsCollectionItem>),
  useAsyncData(`${kebabCase(route.path)}-surround`, () => {
    return queryCollectionItemSurroundings(collectionName.value as keyof Collections, route.path, {
      fields: ['description'],
    })
  }),
])

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const title = page.value.seo?.title || page.value.title
const description = page.value.seo?.description || page.value.description

const headline = ref(findPageHeadline(navigation?.value, page.value?.path))
const breadcrumbs = computed(() => findPageBreadcrumbs(navigation?.value, page.value?.path || ''))

watch(() => navigation?.value, () => {
  headline.value = findPageHeadline(navigation?.value, page.value?.path) || headline.value
})

const ogImages = defineOgImage('Docs', {
  headline: headline.value,
  title: title?.slice(0, 60),
  description,
}, {
  alt: DOCS_OG_IMAGE_ALT,
})
// The card's path is known only on the server, so the payload carries it to
// the client, which writes the same structured data when it hydrates.
const ogImage = useState(`og-image:${route.path}`, () => ogImages[0])

const url = `${SITE_URL}${route.path}`
const markdownUrl = `${SITE_URL}/raw${route.path}.md`
const dateModified = GIT_DATES[`content/${page.value.stem}.${page.value.extension}`]

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'article',
  ogUrl: url,
  twitterTitle: title,
  twitterDescription: description,
})

useHead({
  link: [
    { rel: 'canonical', href: url },
    { rel: 'alternate', type: 'text/markdown', href: markdownUrl },
  ],
  script: computed(() => [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(techArticle({
        headline: title,
        description,
        path: route.path,
        dateModified,
        image: ogImage.value,
      })),
    },
    ...(breadcrumbs.value?.length
      ? [{ type: 'application/ld+json', innerHTML: JSON.stringify(breadcrumbList(breadcrumbs.value)) }]
      : []),
  ]),
})

const github = computed(() => appConfig.github ? appConfig.github : null)

const editLink = computed(() => {
  if (!github.value) {
    return
  }

  return [
    github.value.url,
    'edit',
    github.value.branch,
    github.value.rootDir,
    'content',
    `${page.value?.stem}.${page.value?.extension}`,
  ].filter(Boolean).join('/')
})

// Add the page path to the prerender list
addPrerenderPath(`/raw${route.path}.md`)
</script>

<template>
  <UPage
    v-if="page"
    :ui="isOpen ? { center: 'lg:col-span-10' } : undefined"
  >
    <UPageHeader
      :title="page.title"
      :description="page.description"
      :headline="headline"
      :ui="{
        wrapper: 'flex-row items-center flex-wrap justify-between',
      }"
    >
      <template #links>
        <UButton
          v-for="(link, index) in (page as DocsCollectionItem).links"
          :key="index"
          size="sm"
          v-bind="link"
        />

        <DocsPageHeaderLinks />
      </template>
    </UPageHeader>

    <UPageBody>
      <ContentRenderer
        v-if="page"
        :value="page"
      />

      <!-- decorative: the separator holds the page's links, and a role="separator"
           can't (axe's nested-interactive). Reka renders it with role="none". -->
      <USeparator
        v-if="github"
        decorative
      >
        <div
          class="flex items-center gap-2 text-sm text-muted"
        >
          <UButton
            variant="link"
            color="neutral"
            :to="editLink"
            target="_blank"
            icon="i-lucide-pen"
            :ui="{ leadingIcon: 'size-4' }"
          >
            {{ t('docs.edit') }}
          </UButton>
          <template v-if="github?.url">
            <span>{{ t('common.or') }}</span>
            <UButton
              variant="link"
              color="neutral"
              :to="`${github.url}/issues/new/choose`"
              target="_blank"
              icon="i-lucide-alert-circle"
              :ui="{ leadingIcon: 'size-4' }"
            >
              {{ t('docs.report') }}
            </UButton>
          </template>
        </div>
      </USeparator>
      <UContentSurround :surround="surround" />
    </UPageBody>

    <template
      v-if="!isOpen"
      #right
    >
      <DocsAsideRight
        :page="page"
      />
    </template>
  </UPage>
</template>
