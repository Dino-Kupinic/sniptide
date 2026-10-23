import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { type AuthConfig, createAuth } from "@workspace/auth"
import { session, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const BASE = "http://localhost:3000"
const EMAIL = "invited@example.com"
const PASSWORD = "long-enough-password"

function makeAuth(options: Partial<AuthConfig> = {}) {
  return createAuth({
    db: getDb(),
    secret: "test-secret-that-is-long-enough-for-better-auth",
    baseURL: BASE,
    allowedEmails: EMAIL,
    ...options,
  })
}
function post(auth: ReturnType<typeof makeAuth>, path: string, body: unknown, cookie = "") {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, cookie },
      body: JSON.stringify(body),
    }),
  )
}
function signUp(auth: ReturnType<typeof makeAuth>, extra: Record<string, unknown> = {}) {
  return post(auth, "/sign-up/email", {
    name: "invited",
    username: "invited",
    email: EMAIL,
    password: PASSWORD,
    ...extra,
  })
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ")
}
function mail() {
  const links: string[] = []
  return {
    links,
    emailVerification: {
      sendVerificationEmail: async ({ url }: { url: string }) => {
        links.push(url)
      },
    },
  }
}

describeDb("invited email ownership", () => {
  beforeEach(resetDatabase)
  afterAll(resetDatabase)

  test("invited sign-up sends verification without authenticating the claimed identity", async () => {
    const sender = mail()
    const auth = makeAuth(sender)
    const response = await signUp(auth, { pendingInvitation: false, emailVerified: true })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.token).toBeNull()
    expect(body.user).not.toHaveProperty("pendingInvitation")
    expect(sender.links).toHaveLength(1)
    expect(await getDb().select().from(session)).toHaveLength(0)
    for (const path of ["/sign-in/email", "/sign-in/username"]) {
      const denied = await post(auth, path, {
        email: EMAIL,
        username: "invited",
        password: PASSWORD,
      })
      expect(denied.status).toBe(403)
      expect(await denied.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" })
      expect(cookies(denied)).not.toContain("session_token")
    }
  })

  test("pending identities stay blocked when SMTP and the invite list disappear", async () => {
    await signUp(makeAuth(mail()))
    const auth = makeAuth({ allowedEmails: undefined })
    expect((await post(auth, "/sign-in/email", { email: EMAIL, password: PASSWORD })).status).toBe(
      403,
    )
    const [account] = await getDb().select().from(user).where(eq(user.email, EMAIL))
    if (!account) throw new Error("missing pending account")
    const context = await auth.$context
    await expect(context.internalAdapter.createSession(account.id)).rejects.toMatchObject({
      body: { code: "EMAIL_NOT_VERIFIED" },
    })
    expect(await getDb().select().from(session)).toHaveLength(0)
  })

  test("verification proves ownership and creates a session", async () => {
    const sender = mail()
    const auth = makeAuth(sender)
    await signUp(auth)
    const link = sender.links[0]
    if (!link) throw new Error("missing verification link")
    const verified = await auth.handler(new Request(link))
    expect(verified.status).toBeLessThan(400)
    expect(cookies(verified)).toContain("session_token")
    const login = await post(auth, "/sign-in/email", { email: EMAIL, password: PASSWORD })
    expect(login.status).toBe(200)
    const update = await post(auth, "/update-user", { pendingInvitation: false }, cookies(login))
    expect(update.status).toBeLessThan(500)
    const [account] = await getDb().select().from(user).where(eq(user.email, EMAIL))
    expect(account?.emailVerified).toBe(true)
    expect(account).toMatchObject({ pendingInvitation: true })
  })

  test("invite-only password sign-up fails closed without an email sender", async () => {
    expect((await signUp(makeAuth())).status).toBe(403)
    expect(await getDb().select().from(user)).toHaveLength(0)
    expect(await getDb().select().from(session)).toHaveLength(0)
  })

  test("existing unverified users still sign in after invite and SMTP configuration", async () => {
    const created = await signUp(makeAuth({ allowedEmails: undefined }))
    expect(cookies(created)).toContain("session_token")
    expect(
      (await post(makeAuth(mail()), "/sign-in/email", { email: EMAIL, password: PASSWORD })).status,
    ).toBe(200)
  })

  test("verified provider identities can join without an email sender", async () => {
    const context = await makeAuth().$context
    const account = await context.internalAdapter.createUser({
      email: EMAIL,
      name: "Invited",
      emailVerified: true,
    })
    expect(await context.internalAdapter.createSession(account.id)).toHaveProperty("token")
  })

  test("a failed first delivery can be recovered through the public resend endpoint", async () => {
    const failed = makeAuth({
      emailVerification: {
        sendVerificationEmail: async () => {
          throw new Error("SMTP unavailable")
        },
      },
    })
    expect((await signUp(failed)).status).toBe(500)
    expect(await getDb().select().from(session)).toHaveLength(0)
    const sender = mail()
    const auth = makeAuth(sender)
    expect(
      (await post(auth, "/send-verification-email", { email: EMAIL, callbackURL: "/dashboard" }))
        .status,
    ).toBe(200)
    expect(sender.links).toHaveLength(1)
    const link = sender.links[0]
    if (!link) throw new Error("missing resent verification link")
    expect((await auth.handler(new Request(link))).status).toBeLessThan(400)
    expect((await post(auth, "/sign-in/email", { email: EMAIL, password: PASSWORD })).status).toBe(
      200,
    )
  })

  test("SMTP deployments verify an unverified user's new email before applying it", async () => {
    const created = await signUp(makeAuth({ allowedEmails: undefined }))
    const sender = mail()
    const response = await post(
      makeAuth({ ...sender, allowedEmails: undefined }),
      "/change-email",
      { newEmail: "recipient@example.com", callbackURL: "/dashboard" },
      cookies(created),
    )
    expect(response.status).toBe(200)
    const [account] = await getDb().select().from(user)
    expect(account?.email).toBe(EMAIL)
    expect(sender.links).toHaveLength(1)
  })
})
