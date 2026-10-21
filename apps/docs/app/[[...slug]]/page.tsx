import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page"
import { createRelativeLink } from "fumadocs-ui/mdx"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getMDXComponents } from "@/components/mdx"
import { absoluteUrl, ogImagePath, siteName } from "@/lib/site"
import { source } from "@/lib/source"
import { pageStructuredData, serializeJsonLd } from "@/lib/structured-data"

// Home, then each section the page sits in, then the page.
function breadcrumbs(slugs: string[]) {
  const crumbs = [{ name: siteName, path: "/" }]
  for (let depth = 1; depth <= slugs.length; depth++) {
    const part = source.getPage(slugs.slice(0, depth))
    if (part) crumbs.push({ name: part.data.title, path: part.url })
  }
  return crumbs
}

export default async function Page(props: PageProps<"/[[...slug]]">) {
  const { slug } = await props.params
  const page = source.getPage(slug)
  if (!page) notFound()

  const MDX = page.data.body
  const data = pageStructuredData(
    {
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      slugs: page.slugs,
    },
    breadcrumbs(page.slugs),
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
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const { slug } = await props.params
  const page = source.getPage(slug)
  if (!page) notFound()

  const image = ogImagePath(page.slugs)
  return {
    title: page.data.title,
    description: page.data.description,
    alternates: { canonical: absoluteUrl(page.url) },
    // A page's openGraph replaces the layout's, so the site name and locale are repeated here.
    openGraph: {
      type: "article",
      siteName,
      locale: "en_US",
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
