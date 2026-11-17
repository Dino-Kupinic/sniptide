import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  parseTemplate,
  parseTemplateCatalog,
  templateCatalog,
  templateCatalogUrl,
  templateDraft,
  templateJsonUrl,
} from "@/lib/pastes/templates"

// /new?template=<name> reads <TEMPLATES_URL>/<name>.json from the marketing site and opens the
// editor with its files.

const realFetch = globalThis.fetch
const body = {
  name: "claude-md",
  title: "CLAUDE.md template",
  description: "A CLAUDE.md template for Claude Code.",
  files: [{ name: "CLAUDE.md", language: "markdown", content: "# Project\n" }],
}

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.TEMPLATES_URL
})

function serve(response: () => Response) {
  const fetched: string[] = []
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    fetched.push(String(url))
    return response()
  }) as unknown as typeof fetch
  return fetched
}

describe("template URLs", () => {
  test("a template name maps to its JSON file", () => {
    expect(templateJsonUrl("https://sniptide.com/templates/", "claude-md")).toBe(
      "https://sniptide.com/templates/claude-md.json",
    )
  })

  test("anything but a slug is refused before any request", () => {
    for (const name of ["../secrets", "Claude", "a/b", "", "x.json", "-x"])
      expect(templateJsonUrl("https://sniptide.com/templates", name)).toBeNull()
  })
})

describe("template bodies", () => {
  test("keeps the title, description and file names and contents", () => {
    expect(parseTemplate(body)).toEqual({
      title: "CLAUDE.md template",
      description: "A CLAUDE.md template for Claude Code.",
      files: [{ name: "CLAUDE.md", content: "# Project\n" }],
    })
  })

  test("refuses a body a paste couldn't hold", () => {
    expect(parseTemplate({ ...body, files: [] })).toBeNull()
    expect(parseTemplate({ ...body, files: Array(11).fill(body.files[0]) })).toBeNull()
    expect(parseTemplate({ files: body.files })).toBeNull()
    expect(parseTemplate("not json")).toBeNull()
  })
})

describe("templateDraft", () => {
  test("does nothing without TEMPLATES_URL", async () => {
    const fetched = serve(() => Response.json(body))
    expect(await templateDraft("claude-md")).toBeNull()
    expect(fetched).toEqual([])
  })

  test("reads the template from TEMPLATES_URL", async () => {
    process.env.TEMPLATES_URL = "https://sniptide.com/templates"
    const fetched = serve(() => Response.json(body))
    expect((await templateDraft("claude-md"))?.files).toEqual([
      { name: "CLAUDE.md", content: "# Project\n" },
    ])
    expect(fetched).toEqual(["https://sniptide.com/templates/claude-md.json"])
  })

  test("an unknown template or a failing site opens an empty editor", async () => {
    process.env.TEMPLATES_URL = "https://sniptide.com/templates"
    serve(() => new Response("Not found", { status: 404 }))
    expect(await templateDraft("nope")).toBeNull()
    globalThis.fetch = mock(async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch
    expect(await templateDraft("claude-md")).toBeNull()
  })
})

// The dashboard's Paste templates widget lists <TEMPLATES_URL>.json.
const catalogUrl = "https://sniptide.com/templates.json"
const entry = {
  name: "claude-md",
  title: "CLAUDE.md template",
  description: "A CLAUDE.md template for Claude Code.",
  category: "agents",
  files: ["CLAUDE.md"],
  visual: { kind: "logo", src: "/logos/claude.svg", ratio: 4.5 },
}

describe("template catalog", () => {
  test("sits next to the template pages", () => {
    expect(templateCatalogUrl("https://sniptide.com/templates/")).toBe(catalogUrl)
  })

  test("keeps the site's order and resolves artwork against the list", () => {
    const icon = {
      ...entry,
      name: "robots-txt",
      visual: { kind: "icon", src: "/i/robots.svg", mark: "robots.txt" },
    }
    expect(parseTemplateCatalog({ templates: [entry, icon] }, catalogUrl)).toEqual([
      {
        name: "claude-md",
        title: "CLAUDE.md template",
        description: "A CLAUDE.md template for Claude Code.",
        files: ["CLAUDE.md"],
        visual: { kind: "logo", src: "https://sniptide.com/logos/claude.svg", ratio: 4.5 },
      },
      {
        name: "robots-txt",
        title: "CLAUDE.md template",
        description: "A CLAUDE.md template for Claude Code.",
        files: ["CLAUDE.md"],
        visual: { kind: "icon", src: "https://sniptide.com/i/robots.svg", mark: "robots.txt" },
      },
    ])
  })

  test("skips entries it can't use and drops artwork that isn't https", () => {
    const list = parseTemplateCatalog(
      {
        templates: [
          { ...entry, name: "../x" },
          { ...entry, files: [] },
          { ...entry, visual: { kind: "logo", src: "javascript:alert(1)", ratio: 1 } },
          { ...entry, visual: { kind: "logo", src: "http://example.com/a.svg", ratio: 1 } },
          { ...entry, visual: "nope" },
        ],
      },
      catalogUrl,
    )
    expect(list.map((template) => template.visual)).toEqual([null, null, null])
    expect(parseTemplateCatalog({ templates: Array(20).fill(entry) }, catalogUrl)).toHaveLength(12)
    expect(parseTemplateCatalog("not json", catalogUrl)).toEqual([])
  })

  test("is empty without TEMPLATES_URL or when the site fails", async () => {
    const fetched = serve(() => Response.json({ templates: [entry] }))
    expect(await templateCatalog()).toEqual([])
    expect(fetched).toEqual([])
    process.env.TEMPLATES_URL = "https://sniptide.com/templates"
    expect((await templateCatalog()).map((template) => template.name)).toEqual(["claude-md"])
    expect(fetched).toEqual([catalogUrl])
    serve(() => new Response("Bad gateway", { status: 502 }))
    expect(await templateCatalog()).toEqual([])
  })
})
