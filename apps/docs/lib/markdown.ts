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
