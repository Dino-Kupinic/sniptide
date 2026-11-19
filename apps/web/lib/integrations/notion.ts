import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"
import type {
  ExportDestination,
  ExportPaste,
  Failure,
  IntegrationProvider,
  OAuthCredentials,
} from "./types"

// Notion: saving a paste as a page. The new page goes under a page the user picked, with a
// bookmark to the paste and each file as a code block. Notion only lets an integration see the
// pages the user shared with it in Notion's own picker while connecting, so those are the pages
// on offer.

const API = "https://api.notion.com/v1"
const VERSION = "2026-03-11"
const PAGE_SIZE = 100
// Three pages of search results is 300 pages to pick from.
const MAX_PAGES = 3
// Notion's limits: 2000 characters per text item, 100 items per block and 100 blocks per request.
const TEXT_LIMIT = 2000
const ITEMS_PER_BLOCK = 40
const BLOCKS_PER_REQUEST = 100
// Notion refuses a request over 500 KB, so a batch closes before it gets near that.
const BYTES_PER_REQUEST = 350_000

const UNAVAILABLE: Failure = { ok: false, error: "Notion didn't answer. Try again in a minute." }
const NOT_SHARED: Failure = {
  ok: false,
  error: "Sniptide can't see that page. Share it with Sniptide in Notion, then try again.",
}
const DISCONNECTED: Failure = {
  ok: false,
  error: "That connection stopped working. Connect it again in Settings.",
  unauthorized: true,
}

// The language names Notion's code blocks accept. Anything else is saved as plain text.
const NOTION_LANGUAGES = new Set(
  "abap,agda,arduino,assembly,bash,basic,bnf,c,c#,c++,clojure,coffeescript,coq,css,dart,dhall,diff,docker,ebnf,elixir,elm,erlang,f#,flow,fortran,gherkin,glsl,go,graphql,groovy,haskell,hcl,html,idris,java,javascript,json,julia,kotlin,latex,less,lisp,livescript,llvm ir,lua,makefile,markdown,markup,matlab,mathematica,mermaid,nix,objective-c,ocaml,pascal,perl,php,plain text,powershell,prolog,protobuf,purescript,python,r,racket,reason,ruby,rust,sass,scala,scheme,scss,shell,smalltalk,solidity,sql,swift,toml,typescript,vb.net,verilog,vhdl,visual basic,webassembly,xml,yaml".split(
    ",",
  ),
)
const LANGUAGE_ALIASES: Record<string, string> = {
  dockerfile: "docker",
  tsx: "typescript",
  jsx: "javascript",
  "c sharp": "c#",
  csharp: "c#",
  zsh: "shell",
  sh: "shell",
  terraform: "hcl",
  text: "plain text",
  "plain text": "plain text",
}

export function notionLanguage(name: string) {
  const key = name.toLowerCase()
  if (NOTION_LANGUAGES.has(key)) return key
  return LANGUAGE_ALIASES[key] ?? "plain text"
}

const searchSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      object: z.string(),
      in_trash: z.boolean().optional(),
      archived: z.boolean().optional(),
      properties: z
        .record(
          z.string(),
          z.object({
            type: z.string(),
            title: z.array(z.object({ plain_text: z.string() })).optional(),
          }),
        )
        .optional(),
    }),
  ),
  next_cursor: z.string().nullish(),
  has_more: z.boolean().optional(),
})

const meSchema = z.object({
  id: z.string(),
  bot: z
    .object({ workspace_name: z.string().nullish(), workspace_id: z.string().nullish() })
    .optional(),
})

const errorSchema = z.object({ code: z.string().optional() })

async function call(
  method: "GET" | "POST" | "PATCH",
  path: string,
  token: string,
  body?: unknown,
): Promise<{ ok: true; data: unknown } | Failure> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "notion-version": VERSION,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null)
  if (!response) return UNAVAILABLE
  if (response.status === 401) return DISCONNECTED
  const data: unknown = await response.json().catch(() => null)
  if (response.ok) return { ok: true, data }
  const code = errorSchema.safeParse(data).data?.code
  if (response.status === 404 || code === "object_not_found" || code === "restricted_resource")
    return NOT_SHARED
  return UNAVAILABLE
}

function pageTitle(properties: z.infer<typeof searchSchema>["results"][number]["properties"]) {
  for (const property of Object.values(properties ?? {})) {
    if (property.type === "title")
      return (property.title ?? []).map((part) => part.plain_text).join("")
  }
  return ""
}

async function destinations(
  token: string,
): Promise<{ ok: true; destinations: ExportDestination[] } | Failure> {
  const found: ExportDestination[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await call("POST", "/search", token, {
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: PAGE_SIZE,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    if (!result.ok) return result
    const parsed = searchSchema.safeParse(result.data)
    if (!parsed.success) return UNAVAILABLE
    for (const item of parsed.data.results) {
      if (item.object !== "page" || item.in_trash || item.archived) continue
      found.push({ id: item.id, name: pageTitle(item.properties) || "Untitled", private: true })
    }
    cursor = parsed.data.has_more ? (parsed.data.next_cursor ?? undefined) : undefined
    if (!cursor) break
  }
  return { ok: true, destinations: found }
}

function text(content: string) {
  return { type: "text", text: { content } }
}

function chunk(content: string, size: number) {
  const parts: string[] = []
  for (let start = 0; start < content.length; start += size)
    parts.push(content.slice(start, start + size))
  return parts.length > 0 ? parts : [""]
}

// The page Notion receives: a bookmark to the paste, then each file under its name. A file too
// long for one code block continues in the next.
export function notionPage(paste: ExportPaste) {
  const blocks: unknown[] = [{ type: "bookmark", bookmark: { url: paste.url } }]
  for (const file of paste.files ?? []) {
    blocks.push({ type: "heading_3", heading_3: { rich_text: [text(file.name)] } })
    const language = notionLanguage(file.language)
    const items = chunk(file.content, TEXT_LIMIT)
    for (let start = 0; start < items.length; start += ITEMS_PER_BLOCK) {
      blocks.push({
        type: "code",
        code: { language, rich_text: items.slice(start, start + ITEMS_PER_BLOCK).map(text) },
      })
    }
  }
  return { title: paste.title || "Sniptide paste", blocks }
}

// Splits blocks into requests under Notion's block count and size limits.
export function batches(blocks: unknown[]) {
  const result: unknown[][] = []
  let current: unknown[] = []
  let bytes = 0
  for (const block of blocks) {
    const size = Buffer.byteLength(JSON.stringify(block))
    if (
      current.length >= BLOCKS_PER_REQUEST ||
      (current.length > 0 && bytes + size > BYTES_PER_REQUEST)
    ) {
      result.push(current)
      current = []
      bytes = 0
    }
    current.push(block)
    bytes += size
  }
  if (current.length > 0) result.push(current)
  return result
}

function basic({ clientId, clientSecret }: OAuthCredentials) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
}

export const notion: IntegrationProvider = {
  id: "notion",
  name: "Notion",
  oauth: {
    authorizeUrl: `${API}/oauth/authorize`,
    tokenUrl: `${API}/oauth/token`,
    scopes: [],
    pkce: false,
    tokenRequest: "basic-json",
    authorizeParams: { owner: "user" },
    credentials: () => getConfig().notion ?? null,
  },
  async account(token) {
    const result = await call("GET", "/users/me", token)
    if (!result.ok) return null
    const me = meSchema.safeParse(result.data)
    if (!me.success) return null
    return {
      id: me.data.bot?.workspace_id ?? me.data.id,
      name: me.data.bot?.workspace_name ?? "Notion",
    }
  },
  async revoke(token, credentials) {
    await fetch(`${API}/oauth/revoke`, {
      method: "POST",
      headers: { authorization: basic(credentials), "content-type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
  },
  exports: {
    kind: "page",
    content: true,
    destinations,
    async send(token, destination, paste) {
      const page = notionPage(paste)
      const [first = [], ...rest] = batches(page.blocks)
      const created = await call("POST", "/pages", token, {
        parent: { page_id: destination },
        properties: { title: { title: [text(page.title)] } },
        children: first,
      })
      if (!created.ok) return created
      const id = z.object({ id: z.string() }).safeParse(created.data)
      if (!id.success) return UNAVAILABLE
      for (const children of rest) {
        const appended = await call("PATCH", `/blocks/${id.data.id}/children`, token, { children })
        if (!appended.ok) return appended
      }
      return { ok: true }
    },
  },
}
