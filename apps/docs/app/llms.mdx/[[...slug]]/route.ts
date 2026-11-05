import { notFound } from "next/navigation"
import { i18n } from "@/lib/i18n"
import { pageMarkdown } from "@/lib/markdown"
import { source } from "@/lib/source"

// A page as Markdown, for "Copy page" and the "Open in ChatGPT" and "Open in Claude" links. Pages
// are written in English, so this serves the English page.
export const revalidate = false

export async function GET(_request: Request, context: RouteContext<"/llms.mdx/[[...slug]]">) {
  const { slug = [] } = await context.params
  const page = source.getPage(slug, i18n.defaultLanguage)
  if (!page) notFound()
  const markdown = pageMarkdown({
    title: page.data.title,
    description: page.data.description,
    url: page.url,
    body: await page.data.getText("processed"),
  })
  return new Response(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8" } })
}

export function generateStaticParams() {
  return source.getPages(i18n.defaultLanguage).map((page) => ({ slug: page.slugs }))
}
