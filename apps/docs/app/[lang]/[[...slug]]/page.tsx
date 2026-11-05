import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/notebook/page"
import { createRelativeLink } from "fumadocs-ui/mdx"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { ComponentProps } from "react"
import { Feedback } from "@/components/feedback"
import { getMDXComponents } from "@/components/mdx"
import { i18n, localePath } from "@/lib/i18n"
import { absoluteUrl, ogImagePath, siteName } from "@/lib/site"
import { isTranslated, pageLanguages, source } from "@/lib/source"
import { pageStructuredData, serializeJsonLd } from "@/lib/structured-data"

// Home, then each section the page sits in, then the page.
function breadcrumbs(slugs: string[], lang: string) {
  const crumbs = [{ name: siteName, path: source.getPage([], lang)?.url ?? "/" }]
  for (let depth = 1; depth <= slugs.length; depth++) {
    const part = source.getPage(slugs.slice(0, depth), lang)
    if (part) crumbs.push({ name: part.data.title, path: part.url })
  }
  return crumbs
}

export default async function Page(props: PageProps<"/[lang]/[[...slug]]">) {
  const { lang, slug } = await props.params
  const page = source.getPage(slug, lang)
  if (!page) notFound()

  const MDX = page.data.body
  const RelativeLink = createRelativeLink(source, page)
  // Links in the content name English paths, such as /mcp, and keep the reader in their language.
  function LocalLink({ href, ...rest }: ComponentProps<"a">) {
    return <RelativeLink {...rest} href={href && localePath(lang, href)} />
  }
  const data = pageStructuredData(
    {
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      slugs: page.slugs,
      lang: isTranslated(page) ? lang : i18n.defaultLanguage,
    },
    breadcrumbs(page.slugs, lang),
  )

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <script
        type="application/ld+json"
        // Built from the page's own title and description by serializeJsonLd, which escapes "<".
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({ a: LocalLink })} />
      </DocsBody>
      <Feedback lang={lang} path={page.url} />
    </DocsPage>
  )
}

export function generateStaticParams() {
  return source.generateParams("slug", "lang")
}

const ogLocales: Record<string, string> = {
  en: "en_US",
  de: "de_DE",
  es: "es_ES",
  ja: "ja_JP",
  zh: "zh_CN",
}

export async function generateMetadata(props: PageProps<"/[lang]/[[...slug]]">): Promise<Metadata> {
  const { lang, slug } = await props.params
  const page = source.getPage(slug, lang)
  if (!page) notFound()

  const image = ogImagePath(page.slugs)
  // An untranslated page is the English page in another frame, so it names the English URL as
  // canonical and only translated pages are listed as alternates.
  const canonical = isTranslated(page)
    ? page.url
    : (source.getPage(page.slugs, i18n.defaultLanguage)?.url ?? page.url)
  const languages = Object.fromEntries(
    pageLanguages(page.slugs).map((code) => [
      code,
      absoluteUrl(source.getPage(page.slugs, code)?.url ?? "/"),
    ]),
  )

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: absoluteUrl(canonical), languages },
    // A page's openGraph replaces the layout's, so the site name and locale are repeated here.
    openGraph: {
      type: "article",
      siteName,
      locale: ogLocales[lang] ?? "en_US",
      url: absoluteUrl(page.url),
      title: page.data.title,
      description: page.data.description,
      images: [{ url: image, width: 1200, height: 630, alt: page.data.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description: page.data.description,
      images: [image],
    },
  }
}
