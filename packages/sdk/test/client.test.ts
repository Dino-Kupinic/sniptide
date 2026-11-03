import { expect, test } from "bun:test"
import { SniptideClient } from "../src/index"

test("all methods send the route contract and return its envelope", async () => {
  const calls: Array<{ url: string; method: string; body: unknown; key: string | null }> = []
  let result: unknown = {}
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      key: new Headers(init?.headers).get("idempotency-key"),
    })
    return new Response(JSON.stringify(result))
  }
  const c = new SniptideClient("token", "https://example.com", fetcher)
  const capture = { title: "a", files: [{ name: "a", content: "b" }] }
  const variables = [{ name: "SECRET", value: "value" }]
  const cases: Array<[() => Promise<unknown>, string, string, unknown, unknown, string | null]> = [
    [
      () => c.me(),
      "GET",
      "me",
      undefined,
      { user: { id: "1", name: "n", username: null }, scopes: ["read"] },
      null,
    ],
    [
      () => c.usage(),
      "GET",
      "usage",
      undefined,
      {
        storageBytes: 0,
        pasteCount: 0,
        fileCount: 0,
        collectionCount: 0,
        reconciledAt: "now",
        apiRequests: [],
      },
      null,
    ],
    [
      () => c.listPastes({ limit: 1 }),
      "GET",
      "pastes?limit=1",
      undefined,
      { pastes: [], nextCursor: null },
      null,
    ],
    [() => c.readPaste("a/b"), "GET", "pastes/a%2Fb", undefined, { paste: { id: "1" } }, null],
    [() => c.createPaste(capture, "key"), "POST", "pastes", capture, { paste: { id: "1" } }, "key"],
    [() => c.updatePaste("a", capture), "PUT", "pastes/a", capture, { paste: { id: "1" } }, null],
    [
      () => c.updateSettings("a", { visibility: "private" }),
      "PATCH",
      "pastes/a",
      { visibility: "private" },
      { paste: { id: "1" }, settings: { visibility: "private" } },
      null,
    ],
    [
      () => c.trashPaste("a"),
      "DELETE",
      "pastes/a",
      undefined,
      { trashed: { id: "1", slug: "a" } },
      null,
    ],
    [() => c.listCollections(), "GET", "collections", undefined, { collections: [] }, null],
    [
      () => c.createCollection("a", "key"),
      "POST",
      "collections",
      { name: "a" },
      { collection: { slug: "a", name: "a", pasteCount: 0 } },
      "key",
    ],
    [
      () => c.collectionPastes("a", "next +"),
      "GET",
      "collections/a/pastes?cursor=next+%2B",
      undefined,
      { pastes: [], nextCursor: null },
      null,
    ],
    [
      () => c.listEnvGroups(),
      "GET",
      "env",
      undefined,
      { groups: [{ slug: "a", variables: 1, createdAt: "now", updatedAt: "now" }] },
      null,
    ],
    [
      () => c.readEnvGroup("a"),
      "GET",
      "env/a",
      undefined,
      { group: { slug: "a", updatedAt: "now", variables } },
      null,
    ],
    [
      () => c.writeEnvGroup("a", variables),
      "PUT",
      "env/a",
      { variables },
      { group: { slug: "a", updatedAt: "now", variables } },
      null,
    ],
    [() => c.deleteEnvGroup("a"), "DELETE", "env/a", undefined, { ok: true }, null],
  ]
  for (const [call, method, path, body, response, key] of cases) {
    result = response
    expect(await call()).toEqual(response)
    expect(calls.at(-1)).toEqual({ url: `https://example.com/api/v1/${path}`, method, body, key })
  }
})

test("response size limit is configurable and validated", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ value: "123456789" }))
  await expect(
    new SniptideClient("t", "https://example.com", fetcher, 5).me(),
  ).rejects.toMatchObject({ code: "invalid_response" })
  expect(await new SniptideClient("t", "https://example.com", fetcher, 100).me()).toEqual({
    value: "123456789",
  })
  expect(() => new SniptideClient("t", "https://example.com", fetcher, 0)).toThrow()
})

test("rejects redirects, errors and unsafe input", async () => {
  const fetcher: typeof fetch = async (url) => {
    if (String(url).endsWith("redirect")) return new Response(null, { status: 302 })
    if (String(url).endsWith("error"))
      return new Response(JSON.stringify({ message: "Slow down", code: "too_many_requests" }), {
        status: 429,
        headers: { "retry-after": "12" },
      })
    return new Response("[")
  }
  const client = new SniptideClient("token", "https://example.com", fetcher)
  await expect(client.readPaste("redirect")).rejects.toMatchObject({
    code: "redirect",
    status: 302,
  })
  await expect(client.readPaste("error")).rejects.toMatchObject({
    code: "too_many_requests",
    status: 429,
    retryAfter: "12",
  })
  await expect(client.readPaste("malformed")).rejects.toMatchObject({ code: "invalid_response" })
  expect(() => new SniptideClient("token", "http://example.com")).toThrow()
  expect(() => client.readPaste("..")).toThrow()
})

test("sends authorization and retains a base URL prefix", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    expect(String(input)).toBe(
      "https://example.com/prefix/api/v1/pastes?tag=a&tag=b&cursor=next+%2B",
    )
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token")
    return new Response(JSON.stringify({ pastes: [], nextCursor: null }))
  }
  await new SniptideClient("token", "https://example.com/prefix", fetcher).listPastes({
    tag: ["a", "b"],
    cursor: "next +",
  })
})
