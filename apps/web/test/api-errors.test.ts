import { describe, expect, test } from "bun:test"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "@/app/api/[[...path]]/route"
import { GET as me } from "@/app/api/v1/me/route"
import { failure } from "@/lib/api/errors"
import { withToken } from "@/lib/api/http"

describe("API failures", () => {
  test("preserves the error and adds category guidance and private headers", async () => {
    for (const [status, code] of [
      [400, "bad_request"],
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
      [409, "conflict"],
      [413, "payload_too_large"],
      [422, "unprocessable_entity"],
      [429, "too_many_requests"],
      [500, "internal_error"],
    ] as const) {
      const response = failure(status, "Example error", status === 429 ? 30 : undefined)
      const body = await response.json()
      expect(body).toMatchObject({
        ok: false,
        error: "Example error",
        message: "Example error",
        code,
      })
      expect(body.resolution).toBeTruthy()
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(response.headers.get("retry-after")).toBe(status === 429 ? "30" : null)
    }
  })

  test("unknown API methods return JSON and HEAD has no body", async () => {
    for (const handler of [GET, POST, PUT, PATCH, DELETE, OPTIONS]) {
      const response = handler()
      expect(response.status).toBe(404)
      expect(response.headers.get("content-type")).toContain("application/json")
      expect(await response.json()).toMatchObject({ code: "not_found" })
    }
    const response = HEAD()
    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.text()).toBe("")
  })

  test("a known token route rejects missing credentials with JSON", async () => {
    const response = await me(new Request("http://localhost/api/v1/me"))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ ok: false, code: "unauthorized" })
  })

  test("unexpected authentication exceptions do not expose request secrets", async () => {
    const request = new Request("http://localhost/api/v1/me")
    Object.defineProperty(request, "headers", {
      get() {
        throw new Error("secret-token")
      },
    })
    const response = await withToken(request, "read", async () => new Response())
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain("secret-token")
    expect(JSON.parse(text)).toMatchObject({ code: "internal_error" })
  })
})
