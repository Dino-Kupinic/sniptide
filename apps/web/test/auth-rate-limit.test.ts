import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createAuth } from "@workspace/auth"
import { authRateLimit } from "@workspace/db/schema"
import { authIpHeaders } from "@/lib/client-ip"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase } from "./harness"

// Better Auth's sign-in limit (3 tries per 10 seconds) must count per visitor, as Cloudflare
// names them, and live in Postgres so it holds across instances and restarts.

const describeDb = hasDatabase ? describe : describe.skip

const BASE = "http://localhost:3000"

function makeAuth() {
  return createAuth({
    db: getDb(),
    secret: "test-secret-that-is-long-enough-for-better-auth",
    baseURL: BASE,
    ipAddressHeaders: authIpHeaders(),
    rateLimitEnabled: true,
  })
}

function signIn(auth: ReturnType<typeof makeAuth>, headers: Record<string, string>) {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...headers },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
    }),
  )
}

describeDb("better-auth rate limits", () => {
  afterAll(resetDatabase)
  beforeEach(resetDatabase)

  test("count per CF-Connecting-IP, whatever X-Forwarded-For says, and are stored in Postgres", async () => {
    const auth = makeAuth()
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await signIn(auth, {
        "cf-connecting-ip": "198.51.100.30",
        "x-forwarded-for": `10.0.0.${attempt}, 172.70.0.${attempt}`,
      })
      expect(response.status).not.toBe(429)
    }
    expect((await signIn(auth, { "cf-connecting-ip": "198.51.100.30" })).status).toBe(429)

    // Another visitor is not held back by the first one.
    expect((await signIn(auth, { "cf-connecting-ip": "198.51.100.31" })).status).not.toBe(429)

    const rows = await getDb().select().from(authRateLimit)
    expect(rows.some((row) => row.key.includes("198.51.100.30"))).toBe(true)
  })

  test("the stored limit applies to a fresh instance too", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await signIn(makeAuth(), { "cf-connecting-ip": "198.51.100.40" })
    }
    expect((await signIn(makeAuth(), { "cf-connecting-ip": "198.51.100.40" })).status).toBe(429)
  })
})
