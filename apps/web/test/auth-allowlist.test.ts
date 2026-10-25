import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createAuth } from "@workspace/auth"
import { assertAllowed, parseAllowlist } from "@workspace/auth/allowlist"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase } from "./harness"

// While ALLOWED_EMAILS is set, only those emails can create an account. Accounts that already
// exist keep signing in.

const describeDb = hasDatabase ? describe : describe.skip

const BASE = "http://localhost:3000"
const PASSWORD = "long-enough-password"

describe("parseAllowlist", () => {
  test("leaves sign-up open when unset or empty", () => {
    expect(parseAllowlist(undefined)).toBeUndefined()
    expect(parseAllowlist("")).toBeUndefined()
    expect(parseAllowlist(" , ")).toBeUndefined()
  })

  test("matches emails regardless of case and spacing", () => {
    const allowlist = parseAllowlist(" Ada@Example.com , linus@example.com,")
    expect(() => assertAllowed(allowlist, "ada@example.com")).not.toThrow()
    expect(() => assertAllowed(allowlist, " LINUS@example.com ")).not.toThrow()
    expect(() => assertAllowed(allowlist, "eve@example.com")).toThrow()
    expect(() => assertAllowed(allowlist, undefined)).toThrow()
  })
})

describeDb("invite-only sign-up", () => {
  afterAll(resetDatabase)
  beforeEach(resetDatabase)

  function makeAuth(allowedEmails?: string, allowSignUp?: boolean) {
    return createAuth({
      db: getDb(),
      secret: "test-secret-that-is-long-enough-for-better-auth",
      baseURL: BASE,
      allowedEmails,
      allowSignUp,
      emailVerification: { sendVerificationEmail: async () => {} },
    })
  }

  function post(auth: ReturnType<typeof makeAuth>, path: string, body: unknown) {
    return auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify(body),
      }),
    )
  }

  function signUp(auth: ReturnType<typeof makeAuth>, email: string, username: string) {
    return post(auth, "/sign-up/email", { email, password: PASSWORD, name: username, username })
  }

  test("only lets listed emails create an account", async () => {
    const auth = makeAuth("ada@example.com")
    expect((await signUp(auth, "eve@example.com", "eve")).status).toBe(403)
    expect((await signUp(auth, "Ada@Example.com", "ada")).status).toBe(200)
  })

  test("keeps existing accounts signing in", async () => {
    expect((await signUp(makeAuth(), "eve@example.com", "eve")).status).toBe(200)
    const response = await post(makeAuth("ada@example.com"), "/sign-in/email", {
      email: "eve@example.com",
      password: PASSWORD,
    })
    expect(response.status).toBe(200)
  })

  test("is open to anyone without a list", async () => {
    expect((await signUp(makeAuth(), "eve@example.com", "eve")).status).toBe(200)
  })

  test("closes sign-up for everyone, listed emails included", async () => {
    const auth = makeAuth("ada@example.com", false)
    expect((await signUp(auth, "ada@example.com", "ada")).status).toBe(403)
    expect((await signUp(makeAuth(undefined, false), "eve@example.com", "eve")).status).toBe(403)
  })

  test("keeps existing accounts signing in while sign-up is closed", async () => {
    expect((await signUp(makeAuth(), "eve@example.com", "eve")).status).toBe(200)
    const response = await post(makeAuth(undefined, false), "/sign-in/email", {
      email: "eve@example.com",
      password: PASSWORD,
    })
    expect(response.status).toBe(200)
  })
})
