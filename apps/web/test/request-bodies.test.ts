import { afterEach, describe, expect, test } from "bun:test"
import { POST as authPost } from "@/app/api/auth/[...all]/route"
import { POST as localePost } from "@/app/api/locale/route"
import { POST as unlockPost } from "@/app/[slug]/unlock/route"
import { forwardToPostHog } from "@/lib/analytics-proxy"
import { readJson } from "@/lib/api/http"
import { hasDatabase } from "./harness"
import { request } from "./request"

function incoming(url: string, chunkBytes: number, headers?: HeadersInit) {
  let pulls = 0
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++
      if (pulls > 20) controller.close()
      else controller.enqueue(new Uint8Array(chunkBytes).fill(32))
    },
    cancel() {
      cancelled = true
    },
  })
  return {
    request: new Request(url, { method: "POST", body, headers, duplex: "half" }),
    get pulls() {
      return pulls
    },
    get cancelled() {
      return cancelled
    },
  }
}

describe("bounded incoming requests", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.POSTHOG_KEY
    request.cookies.clear()
  })

  test.each([undefined, { "content-length": "1" }])(
    "API stops reading after the byte limit even with an untrusted length %j",
    async (headers) => {
      const stream = incoming("http://x/api/v1/pastes", 8, headers)
      await expect(readJson(stream.request, 10)).rejects.toMatchObject({ status: 413 })
      expect(stream.cancelled).toBe(true)
      expect(stream.pulls).toBeLessThan(20)
    },
  )

  test("unlock limits bytes before looking up the paste", async () => {
    const stream = incoming("http://x/missing/unlock", 600)
    const response = await unlockPost(stream.request, {
      params: Promise.resolve({ slug: "missing" }),
    } as never)
    expect(response.status).toBe(413)
    expect(stream.cancelled).toBe(true)
    expect(stream.pulls).toBeLessThan(20)
  })

  test("locale rejects an oversized valid JSON value without changing cookies", async () => {
    const response = await localePost(
      new Request("http://x/api/locale", { method: "POST", body: '"de"' + " ".repeat(2048) }),
    )
    expect(response.status).toBe(413)
    expect(request.cookies.size).toBe(0)
  })

  test("analytics cancels oversized opaque bodies before contacting the upstream", async () => {
    process.env.POSTHOG_KEY = "phc_test"
    let upstreamCalls = 0
    globalThis.fetch = (async () => {
      upstreamCalls++
      return new Response("{}")
    }) as typeof fetch
    const stream = incoming("http://x/api/analytics/e", 1024 * 1024)
    expect((await forwardToPostHog(stream.request, ["e"])).status).toBe(413)
    expect(upstreamCalls).toBe(0)
    expect(stream.cancelled).toBe(true)
    expect(stream.pulls).toBeLessThan(20)
  })

  const testDb = hasDatabase ? test : test.skip
  testDb("auth cancels a chunked body before invoking Better Auth", async () => {
    const stream = incoming("http://localhost:3000/api/auth/sign-in/email", 64 * 1024)
    expect((await authPost(stream.request)).status).toBe(413)
    expect(stream.cancelled).toBe(true)
    expect(stream.pulls).toBeLessThan(20)
  })
})
