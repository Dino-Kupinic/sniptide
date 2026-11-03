import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

// Drift checks between the documentation and the code it describes. Each one fails when the code
// gains something the docs don't mention, or a page links to a page or heading that doesn't exist,
// so a change that forgets its docs fails `bun run test:docs` instead of reaching readers.

const root = join(import.meta.dir, "..", "..", "..")
const contentDir = join(import.meta.dir, "..", "content", "docs")
const read = (path: string) => readFileSync(join(root, path), "utf8")

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return mdxFiles(path)
    return entry.name.endsWith(".mdx") ? [path] : []
  })
}

// The page's URL as the docs site serves it: content/docs/a/index.mdx is /a.
function pageUrl(file: string) {
  const path = relative(contentDir, file)
    .replace(/\.mdx$/, "")
    .replace(/(^|\/)index$/, "")
  return `/${path}`
}

// Heading ids as Fumadocs generates them (github-slugger): lowercase, punctuation dropped,
// spaces turned into hyphens.
function slug(heading: string) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\- ]/gu, "")
    .replace(/ /g, "-")
}

// Prose without fenced code, so a `## comment` inside a code block isn't read as a heading.
const prose = (text: string) => text.replace(/```[\s\S]*?```/g, "")

const pages = new Map(
  mdxFiles(contentDir).map((file) => {
    const text = readFileSync(file, "utf8")
    const headings = [...prose(text).matchAll(/^#{2,4} (.+)$/gm)].map((match) =>
      slug(match[1] ?? ""),
    )
    return [pageUrl(file), { file, text, headings: new Set(headings) }]
  }),
)
const page = (url: string) => {
  const found = pages.get(url)
  if (!found) throw new Error(`No docs page at ${url}`)
  return found.text
}

describe("internal links", () => {
  test("every link points at an existing page and heading", () => {
    const broken: string[] = []
    for (const [url, { text }] of pages) {
      const links = [...text.matchAll(/(?<!!)\[[^\]]*\]\((\/[^)\s]*)\)|href="(\/[^"]*)"/g)].map(
        (match) => match[1] ?? match[2] ?? "",
      )
      for (const link of links) {
        if (link.startsWith("/og/")) continue
        const [path = "", anchor] = link.split("#")
        const target = pages.get(path.replace(/\/$/, "") || "/")
        if (!target) broken.push(`${url}: ${link} (no such page)`)
        else if (anchor && !target.headings.has(anchor))
          broken.push(`${url}: ${link} (no such heading)`)
      }
    }
    expect(broken).toEqual([])
  })

  test("every local image has alternative text and exists in public", () => {
    const broken: string[] = []
    for (const [url, { text }] of pages) {
      for (const match of prose(text).matchAll(/!\[([^\]]*)\]\((\/[^)\s]*)\)/g)) {
        const [, alt = "", path = ""] = match
        if (!alt.trim()) broken.push(`${url}: ${path} (missing alternative text)`)
        if (
          path.split("/").includes("..") ||
          !existsSync(join(import.meta.dir, "..", "public", path))
        )
          broken.push(`${url}: ${path} (no such image)`)
      }
    }
    expect(broken).toEqual([])
  })

  test("every page is listed in a sidebar", () => {
    const unlisted: string[] = []
    for (const [url, { file }] of pages) {
      const dir = join(file, "..")
      const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { pages: string[] }
      const name = file.endsWith("index.mdx") ? "index" : (file.split("/").pop() ?? "")
      if (!meta.pages.includes(name.replace(/\.mdx$/, ""))) unlisted.push(url)
    }
    expect(unlisted).toEqual([])
  })
})

describe("docs follow the code", () => {
  test("Configuration lists every variable in apps/web/.env.example", () => {
    const variables = new Set(
      [...read("apps/web/.env.example").matchAll(/^#? ?([A-Z][A-Z0-9_]{2,})=/gm)].map(
        (match) => match[1] ?? "",
      ),
    )
    const docs = page("/self-hosting/configuration")
    const missing = [...variables].filter((name) => !docs.includes(`\`${name}\``))
    expect(missing).toEqual([])
  })

  test("the MCP page lists every tool and prompt", () => {
    const server = read("packages/mcp/src/server.ts")
    const names = [...server.matchAll(/register(?:Tool|Prompt)\(\s*"([a-z_]+)"/g)].map(
      (match) => match[1] ?? "",
    )
    expect(names.length).toBeGreaterThan(0)
    const docs = page("/mcp")
    expect(names.filter((name) => !docs.includes(`\`${name}\``))).toEqual([])
  })

  test("the CLI page covers every command and option", () => {
    const cli = read("packages/cli/src/cli.ts")
    const block = cli.match(/const allowed[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
    const commands = [...block.matchAll(/^\s+"?([a-z]+(?: [a-z]+)?)"?: \[/gm)].map(
      (match) => match[1] ?? "",
    )
    const globals = cli.match(/const globalOptions = \[([^\]]*)\]/)?.[1] ?? ""
    const options = [...`${block}${globals}`.matchAll(/"([a-z-]+)"/g)]
      .map((match) => match[1] ?? "")
      .filter((value) => !commands.includes(value))
    expect(commands.length).toBeGreaterThan(0)
    const docs = page("/cli")
    expect(commands.filter((name) => !docs.includes(`sniptide ${name}`))).toEqual([])
    expect([...new Set(options)].filter((name) => !docs.includes(`--${name}`))).toEqual([])
  })

  test("API tokens lists every /api/v1 route and method", () => {
    const routes = readdirSync(join(root, "apps/web/app/api/v1"), { recursive: true })
      .map(String)
      .filter((path) => path.endsWith("route.ts"))
    const docs = page("/api-tokens")
    const missing: string[] = []
    for (const route of routes) {
      const source = read(`apps/web/app/api/v1/${route}`)
      const path = `/${route.replace(/\/?route\.ts$/, "")}`
        .replace(/\[id\]/g, "{id}")
        .replace(/\[([a-z]+)\]/g, "{$1}")
      for (const [, method] of source.matchAll(
        /export async function (GET|POST|PUT|PATCH|DELETE)/g,
      )) {
        const pattern = new RegExp(`${method} ${path.replace(/[{}]/g, "\\$&")}(?![\\w/])`)
        if (!pattern.test(docs)) missing.push(`${method} ${path}`)
      }
    }
    expect(missing).toEqual([])
  })
})
