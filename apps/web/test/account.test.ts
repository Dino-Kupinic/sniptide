import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { account, session, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import {
  changeEmail,
  revokeOtherSessions,
  revokeSession,
  setPassword,
  unlinkProvider,
} from "@/lib/account/actions"
import { describeUserAgent, readAccountSecurity } from "@/lib/account/store"
import { getAuth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { oauthErrorKey } from "@/lib/oauth-errors"
import { hasDatabase, request, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip

const PASSWORD = "a-long-password-123"

test("user agents name the browser and system, most specific first", () => {
  expect(
    describeUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
    ),
  ).toEqual({ browser: "Edge", os: "macOS" })
  expect(
    describeUserAgent(
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
    ),
  ).toEqual({ browser: "Chrome", os: "Android" })
  expect(
    describeUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
    ),
  ).toEqual({ browser: "Safari", os: "iOS" })
  expect(describeUserAgent(null)).toEqual({ browser: null, os: null })
})

test("OAuth error codes map to a message key, unknown ones to the generic message", () => {
  expect(oauthErrorKey("account_not_linked")).toBe("accountNotLinked")
  expect(oauthErrorKey("invite_only")).toBe("inviteOnly")
  expect(oauthErrorKey("signup_disabled")).toBe("signUpClosed")
  expect(oauthErrorKey("state_mismatch")).toBe("generic")
  expect(oauthErrorKey("__proto__")).toBe("generic")
  expect(oauthErrorKey(undefined)).toBeNull()
  expect(oauthErrorKey(["account_not_linked"])).toBeNull()
})

describeDb("account management", () => {
  afterAll(resetDatabase)
  beforeEach(resetDatabase)

  // Signs up through Better Auth and makes the next action come from that browser.
  async function signUp(email: string, username: string, userAgent = "Firefox/140.0 Linux") {
    const auth = await getAuth()
    const { headers, response } = await auth.api.signUpEmail({
      body: { name: username, email, password: PASSWORD, username },
      headers: new Headers({ "user-agent": userAgent }),
      returnHeaders: true,
    })
    useSession(response.user.id, headers)
    return response.user.id
  }

  async function signIn(email: string, userAgent: string) {
    const auth = await getAuth()
    const { headers, response } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      headers: new Headers({ "user-agent": userAgent }),
      returnHeaders: true,
    })
    return { headers, userId: response.user.id }
  }

  function useSession(userId: string, setCookie: Headers) {
    const cookie = (setCookie.get("set-cookie") ?? "").split(";")[0] ?? ""
    request.headers = new Headers({ cookie })
    signInAs(userId)
  }

  async function sessionsOf(userId: string) {
    return getDb().select().from(session).where(eq(session.userId, userId))
  }

  test("changing the email asks for the password and applies without SMTP", async () => {
    const id = await signUp("ada@example.com", "ada")
    expect(await changeEmail({ newEmail: "ada@new.example.com" })).toMatchObject({ ok: false })
    expect(
      await changeEmail({ newEmail: "ada@new.example.com", password: "wrong-password" }),
    ).toMatchObject({ ok: false, error: "That password isn't right." })
    expect(await changeEmail({ newEmail: "ada@example.com", password: PASSWORD })).toMatchObject({
      ok: false,
      error: "That's already your email.",
    })
    expect(await changeEmail({ newEmail: "Ada@New.Example.com", password: PASSWORD })).toEqual({
      ok: true,
      status: "changed",
    })
    const [row] = await getDb().select().from(user).where(eq(user.id, id))
    expect(row?.email).toBe("ada@new.example.com")
  })

  test("an address another account uses is refused without changing anything", async () => {
    await signUp("linus@example.com", "linus")
    const id = await signUp("grace@example.com", "grace")
    expect(await changeEmail({ newEmail: "linus@example.com", password: PASSWORD })).toEqual({
      ok: false,
      error: "That email can't be used. Try another one.",
    })
    const [row] = await getDb().select().from(user).where(eq(user.id, id))
    expect(row?.email).toBe("grace@example.com")
  })

  test("sessions list without tokens and sign out one at a time or all others", async () => {
    const id = await signUp("ada@example.com", "ada", "Mozilla/5.0 (Macintosh) Firefox/140.0")
    await signIn("ada@example.com", "Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36")
    await signIn("ada@example.com", "Mozilla/5.0 (iPhone) Version/19.0 Safari/604.1")
    const [current] = (await sessionsOf(id)).filter((row) => row.userAgent?.includes("Macintosh"))
    if (!current) throw new Error("missing current session")

    const security = await readAccountSecurity(id, current.id)
    expect(security.hasPassword).toBe(true)
    expect(security.linked).toEqual([])
    expect(security.sessions).toHaveLength(3)
    expect(security.sessions[0]).toMatchObject({ current: true, browser: "Firefox", os: "macOS" })
    expect(JSON.stringify(security)).not.toContain(current.token)

    const windows = security.sessions.find((row) => row.os === "Windows")
    if (!windows) throw new Error("missing Windows session")
    expect(await revokeSession(windows.id)).toEqual({ ok: true })
    expect(await sessionsOf(id)).toHaveLength(2)

    expect(await revokeOtherSessions()).toEqual({ ok: true })
    expect((await sessionsOf(id)).map((row) => row.id)).toEqual([current.id])
  })

  test("a session id from another account is never revoked", async () => {
    const other = await signUp("linus@example.com", "linus")
    const [theirs] = await sessionsOf(other)
    await signUp("ada@example.com", "ada")
    expect(await revokeSession(theirs?.id ?? "")).toEqual({ ok: true })
    expect(await sessionsOf(other)).toHaveLength(1)
  })

  test("a GitHub-only account can add a password but not remove its last login", async () => {
    const id = await seedUser("octo")
    await getDb().insert(account).values({
      id: "octo-github",
      accountId: "12345",
      providerId: "github",
      userId: id,
    })
    const auth = await getAuth()
    const context = await auth.$context
    const created = await context.internalAdapter.createSession(id)
    request.headers = new Headers({
      cookie: `better-auth.session_token=${await signedToken(created.token)}`,
    })
    signInAs(id)

    expect(await unlinkProvider("github")).toEqual({
      ok: false,
      error: "Keep at least one way to sign in. Add a password or connect another account first.",
    })
    expect(await setPassword("short")).toMatchObject({ ok: false })
    expect(await setPassword(PASSWORD)).toEqual({ ok: true })
    expect((await readAccountSecurity(id, created.id)).hasPassword).toBe(true)
    expect(await unlinkProvider("github")).toEqual({ ok: true })
    expect((await readAccountSecurity(id, created.id)).linked).toEqual([])
  })

  // Better Auth's session cookie is the token signed with the secret.
  async function signedToken(token: string) {
    const auth = await getAuth()
    const context = await auth.$context
    const { makeSignature } = await import("better-auth/crypto")
    return encodeURIComponent(`${token}.${await makeSignature(token, context.secret)}`)
  }
})
