import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { inspectModeration, transitionModeration } from "@workspace/db/moderation"
import {
  apiToken,
  collection,
  paste,
  pasteFile,
  pasteRevision,
  rateLimit,
} from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { DELETE as deleteMcp, GET as getMcp, POST as postMcp } from "@/app/api/mcp/route"
import { GET as collectionPastes } from "@/app/api/v1/collections/[slug]/pastes/route"
import { POST as createCollection, GET as listCollections } from "@/app/api/v1/collections/route"
import {
  DELETE as deletePaste,
  GET as getPaste,
  PATCH as patchPaste,
  PUT as putPaste,
} from "@/app/api/v1/pastes/[id]/route"
import { POST as createPaste, GET as listPastes } from "@/app/api/v1/pastes/route"
import { apiLimits } from "@/lib/api/http"
import type { ApiPaste, ApiPasteSummary } from "@/lib/api/pastes"
import { createToken, hashToken } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase, seedPaste, seedUser } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const clients: Client[] = []
let listener: ReturnType<typeof Bun.serve>
let token: string
let readonlyToken: string
let oldAuthUrl: string | undefined
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never
const input = {
  title: "Button pattern",
  tags: ["react"],
  collection: "ui",
  files: [{ name: "src/button.ts", content: "export const Button = 1\n" }],
}

async function issueToken(owner: string, write = true) {
  const result = await createToken(owner, { name: "mcp-test", write, expiry: "never" })
  if (!result.ok) throw new Error(result.error)
  return result.token
}
function rpc(
  token: string | null,
  method = "tools/list",
  params?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(new URL("/api/mcp", listener.url), {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  })
}
async function remote(bearer: string) {
  const client = new Client({ name: "integration", version: "1" })
  clients.push(client)
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", listener.url), {
      requestInit: { headers: { authorization: `Bearer ${bearer}` } },
    }),
  )
  return client
}
async function local() {
  const client = new Client({ name: "stdio-integration", version: "1" })
  clients.push(client)
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: [path.join(import.meta.dir, "../../../packages/mcp/dist/sniptide-mcp.js")],
      env: {
        PATH: process.env.PATH ?? "",
        SNIPTIDE_TOKEN: token,
        SNIPTIDE_BASE_URL: listener.url.href,
      },
      stderr: "pipe",
    }),
  )
  return client
}
async function data(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args })
  expect(result.isError).toBeUndefined()
  return result.structuredContent as {
    paste: ApiPaste
    pastes: ApiPasteSummary[]
    steps: { step: number; paste: ApiPaste }[]
    nextCursor: string | null
    nextStep: number | null
  }
}

interface ManagedCollection {
  slug: string
  name: string
  pasteCount: number
}
interface Managed {
  collections: ManagedCollection[]
  collection: ManagedCollection
  settings: {
    visibility: string
    expiresAt: string
    passwordProtected: boolean
    burnAfterRead: boolean
  }
  trashed: { id: string; slug: string }
}

describeDb("MCP with real token API and Postgres", () => {
  beforeAll(async () => {
    const build = Bun.spawn(["bun", "run", "build"], {
      cwd: path.join(import.meta.dir, "../../../packages/mcp"),
      stdout: "ignore",
      stderr: "pipe",
    })
    if (await build.exited) throw new Error(await new Response(build.stderr).text())
    oldAuthUrl = process.env.BETTER_AUTH_URL
    delete process.env.BETTER_AUTH_URL
    listener = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        const url = new URL(request.url)
        if (url.pathname === "/api/mcp") {
          if (request.method === "GET") return getMcp(request)
          if (request.method === "DELETE") return deleteMcp(request)
          return postMcp(request)
        }
        if (url.pathname === "/api/v1/pastes")
          return request.method === "POST" ? createPaste(request) : listPastes(request)
        if (url.pathname === "/api/v1/collections")
          return request.method === "POST" ? createCollection(request) : listCollections(request)
        const pasteMatch = /^\/api\/v1\/pastes\/([^/]+)$/.exec(url.pathname)
        if (pasteMatch) {
          const route = { PUT: putPaste, PATCH: patchPaste, DELETE: deletePaste }[request.method]
          return (route ?? getPaste)(request, ctx({ id: pasteMatch[1] ?? "" }))
        }
        const collectionMatch = /^\/api\/v1\/collections\/([^/]+)\/pastes$/.exec(url.pathname)
        if (collectionMatch)
          return collectionPastes(request, ctx({ slug: collectionMatch[1] ?? "" }))
        return new Response(null, { status: 404 })
      },
    })
  })
  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close()
  })
  afterAll(async () => {
    listener?.stop(true)
    if (oldAuthUrl === undefined) delete process.env.BETTER_AUTH_URL
    else process.env.BETTER_AUTH_URL = oldAuthUrl
    await resetDatabase()
  })
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("ada")
    await seedUser("bob")
    token = await issueToken("ada")
    readonlyToken = await issueToken("ada", false)
    await getDb().insert(collection).values({ ownerId: "ada", slug: "ui", name: "UI" })
  })

  for (const transport of ["remote HTTP", "local stdio"]) {
    test(`${transport}: find and apply a code pattern, then update it`, async () => {
      const client = transport === "remote HTTP" ? await remote(token) : await local()
      expect((await client.listTools()).tools).toHaveLength(9)
      const created = (await data(client, "create_snippet", input)).paste
      expect(created.visibility).toBe("private")
      const search = await data(client, "search_snippets", {
        query: "Button",
        tags: ["React"],
        language: "typescript",
      })
      expect(search.pastes.map((p: { id: string }) => p.id)).toEqual([created.id])
      const read = (await data(client, "read_snippet", { id: created.id })).paste
      expect(read.files[0]?.name).toBe("src/button.ts")
      expect(read.files[0]?.content).toBe(input.files[0]?.content ?? "")
      const recipe = await data(client, "fetch_collection", { slug: "ui" })
      expect(recipe.steps).toEqual([{ step: 1, paste: read }])
      expect(recipe.nextCursor).toBeNull()
      expect(recipe.nextStep).toBeNull()
      const changed = (
        await data(client, "update_snippet", {
          id: created.slug,
          title: "Updated button",
          files: [{ name: "src/button.ts", content: "export const Button = 2\n" }],
        })
      ).paste
      expect(changed.id).toBe(created.id)
      expect(changed.collection).toBe("ui")
      expect(changed.tags).toEqual(["react"])
      expect(changed.files[0]?.content).toContain("= 2")
      expect(
        await getDb().select().from(pasteRevision).where(eq(pasteRevision.pasteId, created.id)),
      ).toHaveLength(2)
    }, 15_000)

    test(`${transport}: moderation restrictions cover read, search, collection and update tools`, async () => {
      const client = transport === "remote HTTP" ? await remote(token) : await local()
      for (const state of ["pending", "quarantined", "removed"] as const) {
        const created = (await data(client, "create_snippet", input)).paste
        const current = await inspectModeration(getDb(), created.id)
        if (!current) throw new Error("Missing synthetic paste")
        await transitionModeration(
          getDb(),
          {
            commandId: crypto.randomUUID(),
            pasteId: created.id,
            expectedContentVersion: current.contentVersion,
            expectedModerationVersion: current.moderationVersion,
            state,
            reasonCode: "review",
            caseReference: crypto.randomUUID(),
          },
          "mcp-test-operator",
        )
        for (const name of ["read_snippet", "update_snippet"]) {
          const result = await client.callTool({
            name,
            arguments: name === "read_snippet" ? { id: created.id } : { ...input, id: created.id },
          })
          expect(result.isError).toBe(true)
          expect(JSON.stringify(result)).not.toContain(input.title)
          expect(JSON.stringify(result)).not.toContain(input.files[0]?.content ?? "")
        }
        expect((await data(client, "search_snippets", {})).pastes).toEqual([])
        expect((await data(client, "fetch_collection", { slug: "ui" })).steps).toEqual([])
      }
    }, 15_000)
  }
  test("HTTP requires a token on initialization and every subsequent request, never a cookie", async () => {
    expect((await postMcp(rpc(null))).status).toBe(401)
    expect(
      (
        await postMcp(
          rpc(null, "tools/list", undefined, { cookie: "better-auth.session_token=browser" }),
        )
      ).status,
    ).toBe(401)
    expect((await postMcp(rpc("snpt_invalid-token-1234"))).status).toBe(401)
    const client = await remote(token)
    await getDb()
      .delete(apiToken)
      .where(eq(apiToken.hash, hashToken(token)))
    await expect(client.listTools()).rejects.toThrow()
  })
  test("rejects expired tokens and other browser origins; permits this instance's origin", async () => {
    expect(
      (await postMcp(rpc(token, "tools/list", undefined, { origin: "https://attacker.example" })))
        .status,
    ).toBe(403)
    const sameOrigin = await postMcp(
      rpc(token, "tools/list", undefined, { origin: listener.url.origin }),
    )
    expect(sameOrigin.status).toBe(200)
    expect(sameOrigin.headers.get("cache-control")).toBe("private, no-store")
    await getDb()
      .update(apiToken)
      .set({ expiresAt: new Date(0) })
      .where(eq(apiToken.hash, hashToken(token)))
    expect((await postMcp(rpc(token))).status).toBe(401)
  })
  for (const transport of ["remote HTTP", "local stdio"]) {
    test(`${transport}: manage collections, sharing settings and trash`, async () => {
      const client = transport === "remote HTTP" ? await remote(token) : await local()
      const call = async (name: string, args: Record<string, unknown> = {}) => {
        const result = await client.callTool({ name, arguments: args })
        expect(result.isError).toBeUndefined()
        return result.structuredContent as Managed
      }
      expect((await call("list_collections")).collections).toEqual([
        { slug: "ui", name: "UI", pasteCount: 0 },
      ])
      expect((await call("create_collection", { name: "Auth recipes" })).collection).toEqual({
        slug: "auth-recipes",
        name: "Auth recipes",
        pasteCount: 0,
      })
      const duplicate = await client.callTool({
        name: "create_collection",
        arguments: { name: "auth recipes" },
      })
      expect(duplicate.isError).toBe(true)
      expect(JSON.stringify(duplicate.content)).toContain("already have a collection")

      const created = (
        await data(client, "create_snippet", { ...input, collection: "auth-recipes" })
      ).paste
      expect((await call("list_collections")).collections[1]?.pasteCount).toBe(1)
      const changed = await call("update_snippet_settings", {
        id: created.slug,
        visibility: "unlisted",
        expiry: "1d",
        password: "correct horse",
        burnAfterRead: true,
      })
      expect(changed.settings).toMatchObject({
        visibility: "unlisted",
        passwordProtected: true,
        burnAfterRead: true,
      })
      expect(JSON.stringify(changed)).not.toContain("correct horse")
      const expiresIn = Date.parse(changed.settings.expiresAt) - Date.now()
      expect(expiresIn).toBeGreaterThan(23 * 3600_000)
      expect(expiresIn).toBeLessThanOrEqual(24 * 3600_000)
      const [stored] = await getDb().select().from(paste).where(eq(paste.id, created.id))
      expect(stored?.passwordHash).toBeTruthy()
      expect(stored?.passwordHash).not.toContain("correct horse")

      const cleared = await call("update_snippet_settings", {
        id: created.id,
        password: null,
        expiry: "never",
      })
      expect(cleared.settings).toMatchObject({ passwordProtected: false, expiresAt: null })
      const empty = await client.callTool({
        name: "update_snippet_settings",
        arguments: { id: created.id },
      })
      expect(empty.isError).toBe(true)

      expect((await call("trash_snippet", { id: created.slug })).trashed).toEqual({
        id: created.id,
        slug: created.slug,
      })
      const [trashed] = await getDb().select().from(paste).where(eq(paste.id, created.id))
      expect(trashed?.deletedAt).toBeInstanceOf(Date)
      expect(
        (await client.callTool({ name: "read_snippet", arguments: { id: created.id } })).isError,
      ).toBe(true)
      expect(
        (await client.callTool({ name: "trash_snippet", arguments: { id: created.id } })).isError,
      ).toBe(true)
    })
  }
  test("management tools need the write scope and only reach the token owner's pastes", async () => {
    await seedPaste({ slug: "adas", owner: "ada" })
    await seedPaste({ slug: "bobs", owner: "bob" })
    const readonly = await remote(readonlyToken)
    expect(
      (await readonly.callTool({ name: "list_collections", arguments: {} })).isError,
    ).toBeUndefined()
    for (const [name, args] of [
      ["create_collection", { name: "New" }],
      ["update_snippet_settings", { id: "adas", visibility: "public" }],
      ["trash_snippet", { id: "adas" }],
    ] as const) {
      const result = await readonly.callTool({ name, arguments: args })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain("write scope")
    }
    const writer = await remote(token)
    for (const [name, args] of [
      ["update_snippet_settings", { id: "bobs", visibility: "public" }],
      ["trash_snippet", { id: "bobs" }],
    ] as const) {
      expect((await writer.callTool({ name, arguments: args })).isError).toBe(true)
    }
    const [bobs] = await getDb().select().from(paste).where(eq(paste.slug, "bobs"))
    expect(bobs?.deletedAt).toBeNull()
    expect(bobs?.visibility).not.toBe("public")
    expect(await getDb().select().from(collection)).toHaveLength(1)
  })
  test("read-only tokens cannot create or update; other accounts, trash and expiry stay hidden", async () => {
    const readonly = await remote(readonlyToken)
    for (const name of ["create_snippet", "update_snippet"]) {
      const result = await readonly.callTool({ name, arguments: { ...input, id: "other" } })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result)).toContain("write scope")
    }
    await seedPaste({ slug: "other", owner: "bob", visibility: "public" })
    await seedPaste({ slug: "trash", owner: "ada", deletedAt: new Date() })
    await seedPaste({ slug: "expired", owner: "ada", expiresAt: new Date(0) })
    const writer = await remote(token)
    for (const id of ["other", "trash", "expired"]) {
      expect((await writer.callTool({ name: "read_snippet", arguments: { id } })).isError).toBe(
        true,
      )
      expect(
        (await writer.callTool({ name: "update_snippet", arguments: { id, ...input } })).isError,
      ).toBe(true)
    }
    expect((await data(writer, "search_snippets", {})).pastes).toEqual([])
  })
  test("updates preserve protection and metadata; failed validation is atomic", async () => {
    const { id } = await seedPaste({
      slug: "protected",
      owner: "ada",
      password: "secret",
      burnAfterRead: true,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const [before] = await getDb().select().from(paste).where(eq(paste.id, id))
    const client = await remote(token)
    await data(client, "update_snippet", {
      id,
      title: "Changed",
      files: input.files,
      description: "description",
      tags: ["react"],
      collection: "ui",
      source: { repository: null, commit: null, dirty: true },
    })
    await data(client, "update_snippet", { id, title: "Changed again", files: input.files })
    const [after] = await getDb().select().from(paste).where(eq(paste.id, id))
    expect(after?.passwordHash).toBe(before?.passwordHash)
    expect(after?.burnAfterRead).toBe(true)
    expect(after?.expiresAt).toEqual(before?.expiresAt)
    expect(after?.description).toBe("description")
    expect(after?.source).toEqual({ repository: null, commit: null, dirty: true })
    const bad = await client.callTool({
      name: "update_snippet",
      arguments: { id, title: "Bad", files: input.files, collection: "missing" },
    })
    expect(bad.isError).toBe(true)
    const [unchanged] = await getDb().select().from(paste).where(eq(paste.id, id))
    expect(unchanged?.title).toBe("Changed again")
    expect(await getDb().select().from(pasteFile).where(eq(pasteFile.pasteId, id))).toHaveLength(1)
    await data(client, "update_snippet", {
      id,
      title: "Clear",
      files: input.files,
      collection: null,
      source: null,
      tags: [],
    })
    const [cleared] = await getDb().select().from(paste).where(eq(paste.id, id))
    expect(cleared?.collection).toBeNull()
    expect(cleared?.source).toBeNull()
    expect(cleared?.tags).toEqual([])
  })
  test("ordered collection pagination retains files and step numbers across 50 items", async () => {
    for (let i = 0; i < 51; i++) {
      const { id } = await seedPaste({ slug: `step-${i}`, owner: "ada", collection: "ui" })
      await getDb()
        .update(paste)
        .set({ createdAt: new Date(1000 + i * 1000) })
        .where(eq(paste.id, id))
    }
    const client = await remote(token)
    const first = await data(client, "fetch_collection", { slug: "ui" })
    expect(first.steps).toHaveLength(50)
    const next = await data(client, "fetch_collection", {
      slug: "ui",
      cursor: first.nextCursor,
      startStep: first.nextStep,
    })
    expect(next.steps).toHaveLength(1)
    expect(next.steps[0]?.step).toBe(51)
    expect(next.steps[0]?.paste.slug).toBe("step-50")
    expect(next.steps[0]?.paste.files[0]?.content).toBe("secret-body-of-step-50")
    expect(next.nextCursor).toBeNull()
  })
  test("rate limits apply to MCP requests and HTTP has no session or SSE stream", async () => {
    for (const handler of [getMcp, deleteMcp]) {
      expect((await handler(new Request(new URL("/api/mcp", listener.url)))).status).toBe(401)
      const response = await handler(
        new Request(new URL("/api/mcp", listener.url), {
          headers: { authorization: `Bearer ${token}` },
        }),
      )
      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toBe("POST")
    }
    const [row] = await getDb()
      .select()
      .from(apiToken)
      .where(eq(apiToken.hash, hashToken(token)))
    if (!row) throw new Error("Missing token")
    const limit = apiLimits.request(row.id)
    await getDb().update(rateLimit).set({ count: limit.max }).where(eq(rateLimit.key, limit.key))
    const response = await postMcp(rpc(token))
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBeTruthy()
  })
})
