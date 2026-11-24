import { absoluteUrl } from "./site"

// The Markdown of a docs page, for readers who paste it into an LLM. app/llms.mdx serves it, and
// the "Copy page" menu beside each title copies it or hands its URL to ChatGPT or Claude.

// Where a page's Markdown is served: /llms.mdx for the overview, /llms.mdx/mcp for /mcp.
export function markdownPath(slugs: string[]) {
  return slugs.length === 0 ? "/llms.mdx" : `/llms.mdx/${slugs.join("/")}`
}

type MarkdownPage = { title: string; description?: string; url: string; body: string }

// The page under its title, with its URL and description, and with links between pages made
// absolute so they still work outside the site. Fumadocs appends heading ids such as
// "## Install [#install]", which an LLM doesn't need.
export function pageMarkdown({ title, description, url, body }: MarkdownPage) {
  const content = body
    .replace(/^(#{1,6} .*?) \[#[^\]]+\]$/gm, "$1")
    .replace(/\]\((\/[^)\s]*)\)/g, (_match, path: string) => `](${absoluteUrl(path)})`)
    .trim()
  const intro = description ? `${description}\n\n` : ""
  return `# ${title}\n\nSource: ${absoluteUrl(url)}\n\n${intro}${content}\n`
}

type IndexPage = { title: string; description?: string; slugs: string[] }
export type IndexSection = { name: string; pages: IndexPage[] }

// /llms.txt (llmstxt.org): the site's name and summary, then each sidebar section as a list of its
// pages. Each entry links to the page's Markdown, which an LLM reads more cheaply than the HTML.
export function llmsIndex(title: string, summary: string, sections: IndexSection[]) {
  const lines = [`# ${title}`, "", `> ${summary}`]
  for (const section of sections) {
    if (section.pages.length === 0) continue
    lines.push("", `## ${section.name}`, "")
    for (const page of section.pages) {
      const link = `[${page.title}](${absoluteUrl(markdownPath(page.slugs))})`
      lines.push(page.description ? `- ${link}: ${page.description}` : `- ${link}`)
    }
  }
  return `${lines.join("\n")}\n`
}
