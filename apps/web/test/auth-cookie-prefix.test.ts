import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createAuth } from "@workspace/auth"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase } from "./harness"

// A preview under the same parent domain as production gets production's session cookie (via
// COOKIE_DOMAIN), which it can't verify. A cookie prefix gives it a name of its own, so the two
// never meet.

const describeDb = hasDatabase ? describe : describe.skip

const BASE = "http://localhost:3000"
const SECRET = "test-secret-that-is-long-enough-for-better-auth"

function makeAuth(cookiePrefix?: string, cookieDomain?: string) {
  return createAuth({
    db: getDb(),
    secret: SECRET,
    baseURL: BASE,
    cookiePrefix,
    cookieDomain,
  })
}

async function signUp(auth: ReturnType<typeof makeAuth>) {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        email: "someone@example.com",
        password: "long-enough-password",
        name: "Someone",
      }),
    }),
  )
}

// The `name=value` pairs of a response's Set-Cookie headers, as a browser would send them back.
function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")
}

describe("COOKIE_PREFIX", () => {
  test("is optional, and read as given", () => {
    expect(getConfig({}).cookiePrefix).toBeUndefined()
    expect(getConfig({ COOKIE_PREFIX: "" }).cookiePrefix).toBeUndefined()
    expect(getConfig({ COOKIE_PREFIX: "pr-42" }).cookiePrefix).toBe("pr-42")
  })

  test("must be a valid cookie name part", () => {
    for (const value of ["pr 42", "pr.42", "pr;42", "pr=42"]) {
      expect(() => getConfig({ COOKIE_PREFIX: value })).toThrow(/COOKIE_PREFIX may only contain/)
    }
  })
})

describeDb("auth cookie prefix", () => {
  afterAll(resetDatabase)
  beforeEach(resetDatabase)

  test("keeps the default name when unset, so production sessions survive", async () => {
    const response = await signUp(makeAuth())
    expect(response.status).toBe(200)
    expect(cookieHeader(response)).toContain("better-auth.session_token=")
  })

  test("renames every auth cookie, with or without a shared cookie domain", async () => {
    for (const domain of [undefined, "localhost"]) {
      await resetDatabase()
      const response = await signUp(makeAuth("pr-42", domain))
      const names = response.headers.getSetCookie().map((cookie) => cookie.split("=")[0] ?? "")
      expect(names).toContain("pr-42.session_token")
      expect(names.every((name) => name.startsWith("pr-42."))).toBe(true)
    }
  })

  test("ignores a session cookie issued under another prefix", async () => {
    const production = makeAuth(undefined, "localhost")
    const preview = makeAuth("pr-42", "localhost")
    const cookie = cookieHeader(await signUp(production))

    const read = (auth: ReturnType<typeof makeAuth>) =>
      auth.api.getSession({ headers: new Headers({ cookie }) })

    expect(await read(production)).not.toBeNull()
    expect(await read(preview)).toBeNull()
  })
})
