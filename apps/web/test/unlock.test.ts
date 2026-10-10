import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { rateLimit } from "@workspace/db/schema"
import { POST } from "@/app/[slug]/unlock/route"
import { getDb } from "@/lib/db"
import { readSharedPaste } from "@/lib/pastes/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"
import { request } from "./request"

// The password gate must not allow unlimited guessing, from one visitor or spread across many.

const describeDb = hasDatabase ? describe : describe.skip

const PASSWORD = "correct horse"

function attempt(slug: string, password: string, client = "203.0.113.1", body?: string) {
  return POST(
    new Request(`http://x/${slug}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.9, ${client}` },
      body: body ?? JSON.stringify({ password }),
    }),
    { params: Promise.resolve({ slug }) } as never,
  )
}

describeDb("unlocking a paste", () => {
  afterAll(async () => {
    delete process.env.CLIENT_IP_SOURCE
    await resetDatabase()
  })
  beforeEach(async () => {
    // These requests come through one proxy that appends to X-Forwarded-For.
    process.env.CLIENT_IP_SOURCE = "x-forwarded-for"
    await resetDatabase()
    await seedUser("owner")
    await seedPaste({ slug: "pw", owner: "owner", password: PASSWORD })
    await seedPaste({ slug: "plain", owner: "owner", visibility: "public" })
  })

  test("the right password unlocks the paste", async () => {
    expect((await attempt("pw", "nope")).status).toBe(401)
    expect((await attempt("pw", PASSWORD)).status).toBe(200)
    expect((await readSharedPaste("pw")).status).toBe("ok")
  })

  test("a visitor is stopped after 8 wrong guesses, and the right password no longer works", async () => {
    for (let guess = 0; guess < 8; guess++) {
      expect((await attempt("pw", `wrong-${guess}`)).status).toBe(401)
    }

    const limited = await attempt("pw", "wrong-again")
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)

    const correct = await attempt("pw", PASSWORD)
    expect(correct.status).toBe(429)
    expect(request.cookies.size).toBe(0)
    expect((await readSharedPaste("pw")).status).toBe("locked")
  })

  test("simultaneous guesses cannot outrun the limit", async () => {
    const statuses = (
      await Promise.all(Array.from({ length: 30 }, (_, n) => attempt("pw", `guess-${n}`)))
    ).map((response) => response.status)

    expect(statuses.filter((status) => status === 401)).toHaveLength(8)
    expect(statuses.filter((status) => status === 429)).toHaveLength(22)
  })

  test("one visitor being limited does not lock out another", async () => {
    for (let guess = 0; guess < 9; guess++) await attempt("pw", `wrong-${guess}`, "203.0.113.1")

    expect((await attempt("pw", PASSWORD, "203.0.113.2")).status).toBe(200)
  })

  test("guesses spread across many visitors are stopped by the per-paste limit", async () => {
    for (let guess = 0; guess < 60; guess++) {
      expect((await attempt("pw", `wrong-${guess}`, `192.0.2.${guess}`)).status).toBe(401)
    }

    expect((await attempt("pw", PASSWORD, "192.0.2.200")).status).toBe(429)
  })

  test("the visitor's address is the last one the proxy appended, not the first", async () => {
    for (let guess = 0; guess < 8; guess++) {
      await POST(
        new Request("http://x/pw/unlock", {
          method: "POST",
          headers: { "x-forwarded-for": `spoofed-${guess}, 203.0.113.7` },
          body: JSON.stringify({ password: `wrong-${guess}` }),
        }),
        { params: Promise.resolve({ slug: "pw" }) } as never,
      )
    }

    expect((await attempt("pw", "again", "203.0.113.7")).status).toBe(429)
  })

  test("behind Cloudflare, the visitor is CF-Connecting-IP however X-Forwarded-For varies", async () => {
    process.env.CLIENT_IP_SOURCE = "cloudflare"
    for (let guess = 0; guess < 8; guess++) {
      await POST(
        new Request("http://x/pw/unlock", {
          method: "POST",
          headers: {
            "cf-connecting-ip": "198.51.100.23",
            "x-forwarded-for": `198.51.100.${guess}, 172.70.1.${guess}`,
          },
          body: JSON.stringify({ password: `wrong-${guess}` }),
        }),
        { params: Promise.resolve({ slug: "pw" }) } as never,
      )
    }

    const limited = await POST(
      new Request("http://x/pw/unlock", {
        method: "POST",
        headers: { "cf-connecting-ip": "198.51.100.23", "x-forwarded-for": "10.0.0.1" },
        body: JSON.stringify({ password: PASSWORD }),
      }),
      { params: Promise.resolve({ slug: "pw" }) } as never,
    )
    expect(limited.status).toBe(429)
  })

  test("right passwords are not held against the visitor", async () => {
    for (let round = 0; round < 15; round++) {
      expect((await attempt("pw", PASSWORD)).status).toBe(200)
    }
  })

  test("the limit lifts once its window has passed", async () => {
    for (let guess = 0; guess < 9; guess++) await attempt("pw", `wrong-${guess}`)
    expect((await attempt("pw", PASSWORD)).status).toBe(429)

    await getDb()
      .update(rateLimit)
      .set({ windowStart: new Date(Date.now() - 2 * 60 * 60 * 1000) })
    expect((await attempt("pw", PASSWORD)).status).toBe(200)
  })

  test("bounds the request: oversized bodies, long passwords and junk are refused", async () => {
    expect((await attempt("pw", "", "203.0.113.1", "x".repeat(5000))).status).toBe(413)
    expect((await attempt("pw", "a".repeat(201))).status).toBe(400)
    // Refused before any hashing or counting.
    expect(await getDb().select().from(rateLimit)).toHaveLength(0)

    // A body that isn't a password is just a wrong guess.
    expect((await attempt("pw", "", "203.0.113.1", "not json")).status).toBe(401)
    expect((await attempt("pw", "", "203.0.113.1", '{"password":5}')).status).toBe(401)
  })

  test("pastes without a password answer 401 and are not counted", async () => {
    signInAs(null)
    for (let guess = 0; guess < 12; guess++) {
      expect((await attempt("plain", "anything")).status).toBe(401)
    }
    expect(await getDb().select().from(rateLimit)).toHaveLength(0)
  })
})
