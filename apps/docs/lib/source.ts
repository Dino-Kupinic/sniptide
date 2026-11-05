import { loader } from "fumadocs-core/source"
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons"
import { metaSchema, pageSchema } from "fumadocs-core/source/schema"
import { applyMdxPreset } from "fumadocs-mdx/config"
import { defineDocs } from "fumadocs-mdx/macro"
import { codeTheme } from "./code-theme"
import { i18n } from "./i18n"
import { docsRoute } from "./site"

const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    // Fumadocs' defaults with the app's code colours in place of GitHub's themes.
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: { themes: { light: codeTheme, dark: codeTheme } },
    }),
  },
  meta: { schema: metaSchema },
})

// See https://fumadocs.dev/docs/headless/source-api
export const source = loader({
  baseUrl: docsRoute,
  i18n,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
})

type DocsPage = NonNullable<ReturnType<typeof source.getPage>>

// Whether the page has its own file in its language. An untranslated page shows the English file,
// so its canonical link and the sitemap point at the English URL.
export function isTranslated(page: DocsPage) {
  if (page.locale === i18n.defaultLanguage) return true
  return source.getPage(page.slugs, i18n.defaultLanguage)?.path !== page.path
}

// The languages a page exists in, for hreflang links: English and every translation.
export function pageLanguages(slugs: string[]) {
  return i18n.languages.filter((lang) => {
    const page = source.getPage(slugs, lang)
    return page !== undefined && isTranslated(page)
  })
}
