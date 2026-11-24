import type { Node } from "fumadocs-core/page-tree"
import { i18n } from "@/lib/i18n"
import { type IndexSection, llmsIndex } from "@/lib/markdown"
import { siteDescription, siteName } from "@/lib/site"
import { source } from "@/lib/source"

// The index of every page for LLMs, in sidebar order under the sidebar's section names. Pages are
// written in English, so it lists the English pages.
export const revalidate = false

export function GET() {
  const pages = new Map(source.getPages(i18n.defaultLanguage).map((page) => [page.url, page]))
  const sections: IndexSection[] = []
  const add = (url: string) => {
    const page = pages.get(url)
    if (!page) return
    if (sections.length === 0) sections.push({ name: "Pages", pages: [] })
    sections.at(-1)?.pages.push({
      title: page.data.title,
      description: page.data.description,
      slugs: page.slugs,
    })
  }
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      if (node.type === "separator") sections.push({ name: String(node.name ?? ""), pages: [] })
      else if (node.type === "page") add(node.url)
      else {
        if (node.index) add(node.index.url)
        walk(node.children)
      }
    }
  }
  walk(source.getPageTree(i18n.defaultLanguage).children)
  return new Response(llmsIndex(siteName, siteDescription, sections), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
