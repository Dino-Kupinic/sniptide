import { afterEach, describe, expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { normalizeBaseUrl, TokenApiBackend } from "../src/client"
import { handleMcpRequest } from "../src/http"
import { createSniptideServer, type SniptideBackend, ToolError } from "../src/server"

const calls: unknown[] = []
const backend: SniptideBackend = {
  search: async (input) => {
    calls.push(input)
    return { pastes: [], nextCursor: null }
  },
  read: async (id) => ({ paste: { id, files: [{ name: "a.ts", content: "export const a = 1" }] } }),
  collection: async (slug, cursor) => {
    calls.push({ slug, cursor })
    return { pastes: [{ id: "first" }, { id: "second" }], nextCursor: "page2" }
  },
  create: async (input) => {
    calls.push(input)
    return { paste: input }
  },
  update: async (id, input) => {
    calls.push({ id, input })
    return { paste: { id, ...input } }
  },
}
const cleanup: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const stop of cleanup.splice(0).reverse()) await stop()
  calls.length = 0
})
async function connected(service = backend) {
  const server = createSniptideServer(service)
  const client = new Client({ name: "test", version: "1" })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  await client.connect(b)
  cleanup.push(
    () => server.close(),
    () => client.close(),
  )
  return client
}

describe("Sniptide MCP tools", () => {
  test("discover all five tools, schemas and write annotations", async () => {
    const client = await connected()
    const { tools } = await client.listTools()
    expect(tools.map(({ name }) => name)).toEqual([
      "search_snippets",
      "read_snippet",
      "fetch_collection",
      "create_snippet",
      "update_snippet",
    ])
    expect(tools.find(({ name }) => name === "read_snippet")?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find(({ name }) => name === "update_snippet")?.annotations?.destructiveHint).toBe(
      true,
    )
    expect(tools.find(({ name }) => name === "create_snippet")?.inputSchema.required).toEqual([
      "title",
      "files",
    ])
  })
  test("search filters and full code reads survive a protocol round-trip", async () => {
    const client = await connected()
    const args = {
      query: "button",
      tags: ["React"],
      language: "typescript",
      collection: "ui",
      cursor: "page",
      limit: 10,
    }
    expect(
      (await client.callTool({ name: "search_snippets", arguments: args })).isError,
    ).toBeUndefined()
    expect(calls[0]).toEqual({ ...args, tags: ["react"] })
    const result = await client.callTool({ name: "read_snippet", arguments: { id: "paste1" } })
    expect(result.structuredContent).toEqual({
      paste: { id: "paste1", files: [{ name: "a.ts", content: "export const a = 1" }] },
    })
  })
  test("collection pages preserve order and continue step numbers", async () => {
    const client = await connected()
    const result = await client.callTool({
      name: "fetch_collection",
      arguments: { slug: "ui", cursor: "page1", startStep: 51 },
    })
    expect(result.structuredContent).toEqual({
      collection: "ui",
      steps: [
        { step: 51, paste: { id: "first" } },
        { step: 52, paste: { id: "second" } },
      ],
      nextCursor: "page2",
      nextStep: 53,
    })
    expect(calls[0]).toEqual({ slug: "ui", cursor: "page1" })
  })
  test("creates and updates forward only declared fields", async () => {
    const client = await connected()
    const input = { title: "A", files: [{ name: "a.ts", content: "1" }] }
    await client.callTool({
      name: "create_snippet",
      arguments: { ...input, ownerId: "other", password: "injected" },
    })
    expect(calls[0]).toEqual(input)
    await client.callTool({ name: "update_snippet", arguments: { id: "paste1", ...input } })
    expect(calls[1]).toEqual({ id: "paste1", input })
  })
  test("normalizes agent requests while leaving omitted metadata for the API", async () => {
    const client = await connected()
    await client.callTool({
      name: "create_snippet",
      arguments: {
        title: " A ",
        description: " description ",
        tags: [" React ", "react"],
        files: [{ name: " a.ts ", content: "1" }],
      },
    })
    expect(calls).toEqual([
      {
        title: "A",
        description: "description",
        tags: ["react", "react"],
        files: [{ name: "a.ts", content: "1" }],
      },
    ])
  })
  test("invalid identifiers, limits and reversed lines never reach the backend", async () => {
    const client = await connected()
    for (const args of [
      { name: "read_snippet", arguments: { id: "../me" } },
      { name: "search_snippets", arguments: { limit: 101 } },
      {
        name: "create_snippet",
        arguments: {
          title: "A",
          files: [{ name: "a.ts", content: "1", lines: { start: 5, end: 2 } }],
        },
      },
    ]) {
      expect((await client.callTool(args)).isError).toBe(true)
    }
    expect(calls).toEqual([])
  })
  test("safe failures are actionable and unexpected errors are redacted", async () => {
    const client = await connected({
      ...backend,
      read: async () => {
        throw new Error("SQL secret snpt_private")
      },
      create: async () => {
        throw new ToolError("Write scope required.")
      },
    })
    const result = await client.callTool({ name: "read_snippet", arguments: { id: "x" } })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toContain("snpt_private")
    const write = await client.callTool({
      name: "create_snippet",
      arguments: { title: "A", files: [{ name: "a.ts", content: "1" }] },
    })
    expect(write.content).toEqual([{ type: "text", text: "Write scope required." }])
  })
  test("stateless HTTP initializes and calls tools through the official client", async () => {
    const listener = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) => handleMcpRequest(request, backend),
    })
    cleanup.push(() => listener.stop(true))
    const client = new Client({ name: "http-test", version: "1" })
    cleanup.push(() => client.close())
    await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", listener.url)))
    expect((await client.listTools()).tools).toHaveLength(5)
    expect(
      (await client.callTool({ name: "read_snippet", arguments: { id: "x" } })).isError,
    ).toBeUndefined()
  })
})

describe("local token API adapter", () => {
  test("requires a safe instance URL and token", () => {
    for (const url of [
      "http://example.com",
      "https://u:p@example.com",
      "https://example.com?token=x",
      "https://example.com#x",
    ])
      expect(() => normalizeBaseUrl(url)).toThrow(ToolError)
    expect(normalizeBaseUrl("https://example.com/sniptide/")).toBe("https://example.com/sniptide")
    expect(() => new TokenApiBackend("https://example.com", "snpt_abc\r\nsecret")).toThrow(
      ToolError,
    )
  })
  test("preserves path prefixes, encodes queries, authenticates, and uses PUT for updates", async () => {
    const requests: { path: string; authorization: string | null; method: string; body: string }[] =
      []
    const listener = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        requests.push({
          path: new URL(request.url).pathname + new URL(request.url).search,
          authorization: request.headers.get("authorization"),
          method: request.method,
          body: request.method === "GET" ? "" : await request.text(),
        })
        return Response.json({ paste: { id: "x" } })
      },
    })
    cleanup.push(() => listener.stop(true))
    const api = new TokenApiBackend(`${listener.url.href}prefix`, "snpt_test-token-1234567890")
    await api.search({ query: "x & y", tags: ["a", "b"], cursor: "abc+/=" })
    const input = { title: "Changed", files: [{ name: "a.ts", content: "2" }] }
    await api.update("x", input)
    expect(requests[0]?.path).toBe(
      "/prefix/api/v1/pastes?q=x+%26+y&tag=a&tag=b&cursor=abc%2B%2F%3D",
    )
    expect(requests[0]?.authorization).toBe("Bearer snpt_test-token-1234567890")
    expect(requests[1]?.method).toBe("PUT")
    expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual(input)
  })
  test("refuses redirects, errors and invalid JSON without printing response bodies", async () => {
    let status = 302
    let contactedRedirect = false
    const listener = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) => {
        if (new URL(request.url).pathname === "/stolen") contactedRedirect = true
        return new Response("upstream secret", { status, headers: { location: "/stolen" } })
      },
    })
    cleanup.push(() => listener.stop(true))
    const api = new TokenApiBackend(listener.url.href, "snpt_test-token-1234567890")
    for (status of [302, 401, 403, 404, 413, 429, 500, 200]) {
      try {
        await api.read("x")
        throw new Error("expected rejection")
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError)
        expect(String(error)).not.toContain("upstream secret")
      }
    }
    expect(contactedRedirect).toBe(false)
  })
})
