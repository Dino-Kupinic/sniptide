import "server-only"

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

// The Sniptide documentation as one text the assistant answers from. The pages are read from
// apps/docs at runtime (next.config.ts traces them into the standalone build), so the assistant
// always matches the docs of the release it ships with.

export interface DocPage {
  url: string
  title: string
  body: string
}

export function docsDirectory() {
  // The server runs from apps/web, in development and in the image alike.
  return path.join(process.cwd(), "../docs/content/docs")
}

async function mdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) return mdxFiles(full)
      return entry.name.endsWith(".mdx") ? [full] : []
    }),
  )
  return nested.flat().sort()
}

// core-concepts/index.mdx is served at /core-concepts, index.mdx at the site root.
export function pageUrl(docsUrl: string, relativePath: string) {
  const slug = relativePath
    .replace(/\\/g, "/")
    .replace(/\.mdx$/, "")
    .replace(/(^|\/)index$/, "")
  return `${docsUrl.replace(/\/$/, "")}${slug ? `/${slug}` : ""}`
}

export function parsePage(source: string): { title: string; body: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/)
  const title =
    match?.[1]
      ?.match(/^title:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? ""
  const body = (match ? source.slice(match[0].length) : source)
    // Imports and JSX components carry no text a reader needs.
    .replace(/^import .*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { title, body }
}

let cached: { docsUrl: string; pages: Promise<DocPage[]> } | undefined

export function loadDocs(docsUrl: string, directory = docsDirectory()): Promise<DocPage[]> {
  if (cached?.docsUrl === docsUrl) return cached.pages
  const pages = mdxFiles(directory).then((files) =>
    Promise.all(
      files.map(async (file) => {
        const { title, body } = parsePage(await readFile(file, "utf8"))
        return { url: pageUrl(docsUrl, path.relative(directory, file)), title, body }
      }),
    ),
  )
  pages.catch(() => {
    cached = undefined
  })
  cached = { docsUrl, pages }
  return pages
}

export function docsText(pages: DocPage[]) {
  return pages
    .map((page) => `<page url="${page.url}" title="${page.title}">\n${page.body}\n</page>`)
    .join("\n\n")
}
