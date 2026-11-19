import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { integrationConnection } from "@workspace/db/schema"
import { GET as callback } from "@/app/api/integrations/[provider]/callback/route"
import { getDb } from "@/lib/db"
import {
  connectIntegration,
  disconnectIntegration,
  listExportDestinations,
  sendToDestination,
} from "@/lib/integrations/actions"
import { batches, notionLanguage, notionPage } from "@/lib/integrations/notion"
import { listIntegrations } from "@/lib/integrations/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Saving a paste as a Notion page through a connected workspace. Only Notion's answers are faked.

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-long-enough-for-better-auth"

const describeDb = hasDatabase ? describe : describe.skip
const realFetch = globalThis.fetch
const ORIGIN = "http://localhost:3000"
const TOKEN = "ntn_token"
const BASIC = `Basic ${Buffer.from("notion-client:notion-secret").toString("base64")}`

interface Call {
  method: string
  path: string
  headers: Headers
  body: unknown
}

interface Block {
  type: string
  [key: string]: unknown
}

function serveNotion(options: { page?: "missing" | "auth" } = {}) {
  const calls: Call[] = []
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace("/v1", "")
    const headers = new Headers(init?.headers)
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method: init?.method ?? "GET", path, headers, body })
    if (path === "/oauth/token")
      return Response.json({
        access_token: TOKEN,
        refresh_token: "ntn_refresh",
        bot_id: "bot-1",
        workspace_id: "ws-1",
        workspace_name: "Acme",
      })
    if (path === "/oauth/revoke") return Response.json({})
    if (headers.get("authorization") !== `Bearer ${TOKEN}`)
      return Response.json({ code: "unauthorized" }, { status: 401 })
    if (path === "/users/me")
      return Response.json({ id: "bot-1", bot: { workspace_name: "Acme", workspace_id: "ws-1" } })
    if (path === "/search")
      return Response.json({
        results: [
          {
            object: "page",
            id: "page-1",
            properties: { title: { type: "title", title: [{ plain_text: "Engineering" }] } },
          },
          { object: "page", id: "page-2", in_trash: true, properties: {} },
          { object: "page", id: "page-3", properties: {} },
        ],
        has_more: false,
        next_cursor: null,
      })
    if (path === "/pages") {
      if (options.page === "missing")
        return Response.json({ code: "object_not_found" }, { status: 404 })
      if (options.page === "auth") return Response.json({ code: "unauthorized" }, { status: 401 })
      return Response.json({ id: "new-page" })
    }
    if (path.startsWith("/blocks/")) return Response.json({ results: [] })
    return Response.json({ code: "invalid_request_url" }, { status: 400 })
  }) as unknown as typeof fetch
  return calls
}

async function connect() {
  const error = await connectIntegration("notion").then(
    () => null,
    (caught: unknown) => caught,
  )
  const authorize = new URL(((error as { digest?: string }).digest ?? "").split(";")[2] ?? "")
  const response = await callback(
    new Request(
      `${ORIGIN}/api/integrations/notion/callback?code=the-code&state=${authorize.searchParams.get("state")}`,
    ),
    { params: Promise.resolve({ provider: "notion" }) },
  )
  expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?tab=integrations`)
  return authorize
}

describe("the Notion page", () => {
  test("maps language names to Notion's code languages, and the rest to plain text", () => {
    expect(notionLanguage("TypeScript")).toBe("typescript")
    expect(notionLanguage("Dockerfile")).toBe("docker")
    expect(notionLanguage("C++")).toBe("c++")
    expect(notionLanguage("Brainfuck")).toBe("plain text")
  })

  test("splits long files under Notion's text and block limits", () => {
    const content = "x".repeat(2000 * 45)
    const page = notionPage({
      url: "https://s.test/a",
      title: "Big",
      language: "Shell",
      files: [{ name: "big.sh", language: "Shell", content }],
    })
    const blocks = page.blocks as Block[]
    expect(blocks.map((block) => block.type)).toEqual(["bookmark", "heading_3", "code", "code"])
    const code = blocks.filter((block) => block.type === "code") as unknown as {
      code: { language: string; rich_text: { text: { content: string } }[] }
    }[]
    expect(code[0]?.code.language).toBe("shell")
    expect(code[0]?.code.rich_text).toHaveLength(40)
    expect(code[1]?.code.rich_text).toHaveLength(5)
    expect(
      code
        .flatMap((block) => block.code.rich_text)
        .every((item) => item.text.content.length <= 2000),
    ).toBe(true)
  })

  test("closes a request at 100 blocks or before it gets too large", () => {
    expect(
      batches(Array.from({ length: 250 }, () => ({ type: "divider" }))).map(
        (batch) => batch.length,
      ),
    ).toEqual([100, 100, 50])
    const large = { type: "code", text: "x".repeat(200_000) }
    expect(batches([large, large, large]).map((batch) => batch.length)).toEqual([1, 1, 1])
  })

  test("a link-only paste gets a generic title and the bookmark alone", () => {
    expect(
      notionPage({ url: "https://s.test/a", title: null, language: null, files: null }),
    ).toEqual({
      title: "Sniptide paste",
      blocks: [{ type: "bookmark", bookmark: { url: "https://s.test/a" } }],
    })
  })
})

describeDb("Notion", () => {
  afterAll(resetDatabase)
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.NOTION_CLIENT_ID
    delete process.env.NOTION_CLIENT_SECRET
  })
  beforeEach(async () => {
    process.env.NOTION_CLIENT_ID = "notion-client"
    process.env.NOTION_CLIENT_SECRET = "notion-secret"
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  test("connecting uses Notion's page picker, Basic auth and a JSON token request", async () => {
    const calls = serveNotion()
    const authorize = await connect()
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      "https://api.notion.com/v1/oauth/authorize",
    )
    expect(authorize.searchParams.get("owner")).toBe("user")
    expect(authorize.searchParams.has("scope")).toBe(false)
    expect(authorize.searchParams.has("code_challenge")).toBe(false)
    const token = calls[0]
    expect(token?.headers.get("authorization")).toBe(BASIC)
    expect(token?.headers.get("content-type")).toBe("application/json")
    expect(token?.body).toMatchObject({ grant_type: "authorization_code", code: "the-code" })
    expect(calls.find((call) => call.path === "/users/me")?.headers.get("notion-version")).toBe(
      "2026-03-11",
    )
    const notion = (await listIntegrations("owner")).find((item) => item.id === "notion")
    expect(notion).toMatchObject({ available: true, connection: { account: "Acme" } })
  })

  test("lists the pages shared with Sniptide, without trashed ones", async () => {
    serveNotion()
    await connect()
    expect(await listExportDestinations("notion")).toEqual({
      ok: true,
      destinations: [
        { id: "page-1", name: "Engineering", private: true },
        { id: "page-3", name: "Untitled", private: true },
      ],
    })
  })

  test("saves the files of a paste open to anyone with the link, and only the link otherwise", async () => {
    const calls = serveNotion()
    await connect()
    await seedPaste({ slug: "notes", owner: "owner", title: "Deploy notes", content: "echo hi" })
    await seedPaste({ slug: "mine", owner: "owner", visibility: "private", title: "Salaries" })

    expect(await sendToDestination("notion", "notes", "page-1")).toEqual({ ok: true })
    expect(await sendToDestination("notion", "mine", "page-1")).toEqual({ ok: true })
    const pages = calls.filter((call) => call.path === "/pages").map((call) => call.body)
    expect(pages[0]).toEqual({
      parent: { page_id: "page-1" },
      properties: { title: { title: [{ type: "text", text: { content: "Deploy notes" } }] } },
      children: [
        { type: "bookmark", bookmark: { url: `${ORIGIN}/notes` } },
        {
          type: "heading_3",
          heading_3: { rich_text: [{ type: "text", text: { content: "a.txt" } }] },
        },
        {
          type: "code",
          code: {
            language: "plain text",
            rich_text: [{ type: "text", text: { content: "echo hi" } }],
          },
        },
      ],
    })
    expect(pages[1]).toEqual({
      parent: { page_id: "page-1" },
      properties: { title: { title: [{ type: "text", text: { content: "Sniptide paste" } }] } },
      children: [{ type: "bookmark", bookmark: { url: `${ORIGIN}/mine` } }],
    })
    expect(JSON.stringify(pages[1])).not.toContain("Salaries")
  })

  test("a page Sniptide can't see says how to share it", async () => {
    serveNotion({ page: "missing" })
    await connect()
    await seedPaste({ slug: "notes", owner: "owner" })
    expect(await sendToDestination("notion", "notes", "page-9")).toEqual({
      ok: false,
      error: "Sniptide can't see that page. Share it with Sniptide in Notion, then try again.",
    })
  })

  test("a refused token drops the connection", async () => {
    serveNotion({ page: "auth" })
    await connect()
    await seedPaste({ slug: "notes", owner: "owner" })
    expect(await sendToDestination("notion", "notes", "page-1")).toEqual({
      ok: false,
      error: "That connection stopped working. Connect it again in Settings.",
    })
    expect(await getDb().select().from(integrationConnection)).toHaveLength(0)
  })

  test("disconnecting revokes the token at Notion with the client's credentials", async () => {
    const calls = serveNotion()
    await connect()
    expect(await disconnectIntegration("notion")).toEqual({ ok: true })
    const revoke = calls.find((call) => call.path === "/oauth/revoke")
    expect(revoke?.headers.get("authorization")).toBe(BASIC)
    expect(revoke?.body).toEqual({ token: TOKEN })
  })
})
