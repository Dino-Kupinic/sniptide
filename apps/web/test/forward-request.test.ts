import { describe, expect, test } from "bun:test"
import { forwardRequest } from "@/lib/forward-request"

// Next's production build passes route handlers a Proxy around the request, and the Request
// constructor can't read a proxied request's private state ("Cannot read private member #state"),
// which turned every /api/auth call into a 500. Bun is more forgiving than Node about that, so
// these use a stand-in that has a request's url, method, headers and body but nothing the
// constructor could copy from: forwardRequest has to build from those alone.
function lookalike(init: { url: string; method?: string; headers?: HeadersInit; body?: string }) {
  const real = new Request(init.url, init)
  return {
    url: real.url,
    method: real.method,
    headers: real.headers,
    arrayBuffer: () => real.arrayBuffer(),
  } as unknown as Request
}

describe("forwardRequest", () => {
  test("copies a GET with the new headers", () => {
    const request = lookalike({
      url: "http://x/api/auth/get-session?disableCookieCache=true",
      headers: { cookie: "a=1", "x-sniptide-resolved-ip": "6.6.6.6" },
    })
    const headers = new Headers({ cookie: "a=1", "x-sniptide-resolved-ip": "203.0.113.5" })

    const forwarded = forwardRequest(request, headers)

    expect(forwarded.method).toBe("GET")
    expect(forwarded.url).toBe("http://x/api/auth/get-session?disableCookieCache=true")
    expect(forwarded.headers.get("x-sniptide-resolved-ip")).toBe("203.0.113.5")
    expect(forwarded.headers.get("cookie")).toBe("a=1")
    expect(forwarded.body).toBeNull()
  })

  test("copies a POST with the body that was already read", async () => {
    const request = lookalike({
      url: "http://x/api/auth/sign-in/email",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.c", password: "pw" }),
    })
    const body = await request.arrayBuffer()

    const forwarded = forwardRequest(request, new Headers(request.headers), body)

    expect(forwarded.method).toBe("POST")
    expect(forwarded.url).toBe("http://x/api/auth/sign-in/email")
    expect(forwarded.headers.get("content-type")).toBe("application/json")
    expect(await forwarded.json()).toEqual({ email: "a@b.c", password: "pw" })
  })

  test("accepts a real Request too", async () => {
    const request = new Request("http://x/api/auth/sign-up/email", {
      method: "POST",
      body: "{}",
    })

    const forwarded = forwardRequest(
      request,
      new Headers(request.headers),
      await request.arrayBuffer(),
    )

    expect(forwarded.method).toBe("POST")
    expect(await forwarded.text()).toBe("{}")
  })
})
