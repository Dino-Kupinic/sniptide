import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import net, { type Socket } from "node:net"
import { createAuth } from "@workspace/auth"
import { notification, paste, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { GET, POST } from "@/app/api/notifications/unsubscribe/route"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { sendEmailVerification, sendPasswordReset } from "@/lib/mail"
import { deliverNotificationEmails } from "@/lib/notifications/email"
import { notifyExpiringPastes } from "@/lib/notifications/expiring"
import { recordNotifications } from "@/lib/notifications/record"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/store"
import { NOTIFICATION_KINDS } from "@/lib/notifications/types"
import {
  createUnsubscribeToken,
  unsubscribeNotificationEmail,
  verifyUnsubscribeToken,
} from "@/lib/notifications/unsubscribe"
import { readSharedPaste, sharePaste, unsharePaste } from "@/lib/pastes/store"
import { readPreferences } from "@/lib/preference-store"
import { parsePreferences } from "@/lib/preferences-schema"
import { updateNotificationPreference, updatePreferences } from "@/lib/settings-actions"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const DAY = 86_400_000
const describeDb = hasDatabase ? describe : describe.skip
const envKeys = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_FROM",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_SECURE",
  "SMTP_REQUIRE_TLS",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
]

async function smtpSink() {
  const sockets = new Set<Socket>()
  const messages: string[] = []
  const timers = new Set<ReturnType<typeof setInterval>>()
  let mode: "accept" | "reject" | "stall" = "accept"
  let attempts = 0
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on("error", () => {})
    socket.once("close", () => sockets.delete(socket))
    socket.write("220 localhost test SMTP\r\n")
    let buffer = ""
    let data: string[] | null = null
    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n")
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (data) {
          if (line === ".") {
            messages.push(data.join("\r\n"))
            data = null
            socket.write("250 queued\r\n")
          } else data.push(line)
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write("250 localhost\r\n")
        else if (/^MAIL FROM:/i.test(line)) {
          attempts++
          if (mode === "reject") socket.write("451 temporary failure\r\n")
          else if (mode === "stall") {
            socket.write("250-waiting\r\n")
            const timer = setInterval(() => socket.write("250-still waiting\r\n"), 2_000)
            timers.add(timer)
            socket.once("close", () => {
              clearInterval(timer)
              timers.delete(timer)
            })
          } else socket.write("250 sender ok\r\n")
        } else if (/^RCPT TO:/i.test(line)) socket.write("250 recipient ok\r\n")
        else if (line === "DATA") {
          data = []
          socket.write("354 send message\r\n")
        } else if (line === "QUIT") socket.end("221 bye\r\n")
        else socket.write("250 ok\r\n")
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("SMTP sink has no port")
  return {
    port: address.port,
    messages,
    setMode(next: typeof mode) {
      mode = next
    },
    get attempts() {
      return attempts
    },
    get connections() {
      return sockets.size
    },
    async close() {
      for (const timer of timers) clearInterval(timer)
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
async function queueViews(slug = "secret-slug") {
  const { id } = await seedPaste({
    slug,
    owner: "owner",
    title: "Confidential paste title",
    content: "DO NOT EMAIL THIS BODY",
  })
  await recordNotifications(getDb(), [{ userId: "owner", pasteId: id, kind: "views", count: 10 }])
}
async function rows() {
  return getDb().select().from(notification)
}
async function makeDue(fields: Partial<typeof notification.$inferInsert> = {}) {
  await getDb()
    .update(notification)
    .set({ ...fields, emailNextAttemptAt: new Date(Date.now() - 1_000) })
}
async function enable(kind: (typeof NOTIFICATION_KINDS)[number] = "views") {
  expect(await updateNotificationPreference({ kind, channel: "email", enabled: true })).toEqual({
    ok: true,
  })
}

describe("notification preference defaults", () => {
  test("legacy and malformed values retain in-app alerts and opt out of email", () => {
    for (const value of [
      null,
      "{}",
      "bad json",
      '{"notifications":{"views":{"inApp":"false","email":"true"}}}',
    ]) {
      for (const kind of NOTIFICATION_KINDS)
        expect(parsePreferences(value).notifications[kind]).toEqual({ inApp: true, email: false })
    }
    expect(
      parsePreferences('{"notifications":{"views":{"inApp":false,"email":true}}}').notifications
        .views,
    ).toEqual({ inApp: false, email: true })
  })
})

describeDb("notification channel delivery", () => {
  let sink: Awaited<ReturnType<typeof smtpSink>>
  let originalEnv: Map<string, string | undefined>
  beforeEach(async () => {
    originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]))
    for (const key of envKeys) delete process.env[key]
    sink = await smtpSink()
    Object.assign(process.env, {
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(sink.port),
      SMTP_FROM: "sniptide@example.com",
      SMTP_SECURE: "false",
      SMTP_REQUIRE_TLS: "false",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-notification-secret-at-least-32-characters",
    })
    await resetDatabase()
    await seedUser("owner")
    await seedUser("reader")
    await getDb().update(user).set({ emailVerified: true }).where(eq(user.id, "owner"))
    signInAs("owner")
  })
  afterEach(async () => {
    await sink.close()
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  afterAll(resetDatabase)

  test("each kind records its own independent in-app and email choices", async () => {
    const { id } = await seedPaste({ slug: "matrix", owner: "owner" })
    for (const kind of NOTIFICATION_KINDS)
      for (const inApp of [false, true])
        for (const email of [false, true]) {
          expect(
            await updateNotificationPreference({ kind, channel: "inApp", enabled: inApp }),
          ).toEqual({ ok: true })
          await updateNotificationPreference({ kind, channel: "email", enabled: email })
          const key = crypto.randomUUID()
          await recordNotifications(getDb(), [
            { userId: "owner", pasteId: id, kind, dedupeKey: key },
          ])
          const recorded = (await rows()).find((row) => row.dedupeKey === key)
          expect(recorded).toMatchObject({ inApp, emailStatus: email ? "pending" : "disabled" })
          expect(recorded?.emailNextAttemptAt !== null).toBe(email)
        }
    expect(await rows()).toHaveLength(16)
  })
  test("signed-out and malformed preference writes cannot change delivery choices", async () => {
    signInAs(null)
    expect(
      (await updateNotificationPreference({ kind: "views", channel: "email", enabled: true })).ok,
    ).toBe(false)
    expect((await updatePreferences({ indentation: "4" })).ok).toBe(false)
    signInAs("owner")
    for (const value of [
      '{"kind":"unknown","channel":"email","enabled":true}',
      '{"kind":"views","channel":"email","enabled":"true"}',
      '{"kind":"views","channel":"email","enabled":true,"userId":"reader"}',
    ])
      expect((await updateNotificationPreference(JSON.parse(value))).ok).toBe(false)
    expect(
      (await updatePreferences(JSON.parse('{"notifications":{"views":{"email":true}}}'))).ok,
    ).toBe(false)
    expect((await readPreferences("owner")).notifications.views).toEqual({
      inApp: true,
      email: false,
    })
  })
  test("email-only events stay out of the bell, badge and read mutations", async () => {
    await updateNotificationPreference({ kind: "views", channel: "inApp", enabled: false })
    await enable()
    await queueViews()
    const [row] = await rows()
    if (!row) throw new Error("expected queued event")
    expect(await listNotifications()).toEqual({ items: [], unread: 0 })
    await markNotificationRead(row.id)
    await markAllNotificationsRead()
    expect((await rows())[0]?.readAt).toBeNull()
    expect(await deliverNotificationEmails()).toEqual({
      sent: 1,
      skipped: 0,
      retried: 0,
      failed: 0,
    })
    expect(sink.messages).toHaveLength(1)
  })
  test("opt-in sends future events only and mail contains no paste metadata", async () => {
    await queueViews("before-opt-in")
    await enable()
    await queueViews()
    expect((await deliverNotificationEmails()).sent).toBe(1)
    expect((await rows()).map((row) => row.emailStatus).sort()).toEqual(["disabled", "sent"])
    const message = sink.messages[0] ?? ""
    for (const expected of [
      "Subject: Your paste reached a view milestone",
      "http://localhost:3000/analytics",
      "List-Unsubscribe:",
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    ])
      expect(message).toContain(expected)
    for (const secret of [
      "Confidential paste title",
      "DO NOT EMAIL THIS BODY",
      "secret-slug",
      "before-opt-in",
    ])
      expect(message).not.toContain(secret)
  })
  test("real shared, burned, expiring and milestone events reach local SMTP", async () => {
    for (const kind of NOTIFICATION_KINDS) await enable(kind)
    await seedPaste({ slug: "private-secret", owner: "reader", visibility: "private" })
    signInAs("reader")
    await sharePaste("private-secret", "owner", "view")
    await seedPaste({ slug: "burn-secret", owner: "owner", burnAfterRead: true })
    await readSharedPaste("burn-secret", { reveal: true })
    await seedPaste({ slug: "popular-secret", owner: "owner", visibility: "public" })
    await getDb().update(paste).set({ views: 9 }).where(eq(paste.slug, "popular-secret"))
    await readSharedPaste("popular-secret", { visit: true })
    const soon = await seedPaste({
      slug: "expires-secret",
      owner: "owner",
      expiresAt: new Date(Date.now() + 5 * 3_600_000),
    })
    await getDb()
      .update(paste)
      .set({ createdAt: new Date(Date.now() - 3 * DAY) })
      .where(eq(paste.id, soon.id))
    expect(await notifyExpiringPastes()).toBe(1)
    expect((await deliverNotificationEmails()).sent).toBe(4)
    expect((await rows()).map((row) => row.kind).sort()).toEqual([
      "burned",
      "expiring",
      "shared",
      "views",
    ])
    for (const message of sink.messages) {
      expect(message).toContain("To: owner@example.com")
      expect(message).not.toContain("secret")
      expect(message).not.toContain("title-of-")
    }
  })
  test("concurrent workers claim one message once", async () => {
    await enable()
    await queueViews()
    const results = await Promise.all([
      deliverNotificationEmails(),
      deliverNotificationEmails(),
      deliverNotificationEmails(),
    ])
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1)
    expect(sink.messages).toHaveLength(1)
    expect((await rows())[0]).toMatchObject({
      emailStatus: "sent",
      emailAttempts: 1,
      emailClaimToken: null,
    })
  })
  test("temporary SMTP failure persists backoff and succeeds after retry and lease reclaim", async () => {
    await enable()
    await queueViews()
    sink.setMode("reject")
    expect((await deliverNotificationEmails()).retried).toBe(1)
    expect((await rows())[0]).toMatchObject({
      emailStatus: "pending",
      emailAttempts: 1,
      emailClaimToken: null,
    })
    expect((await rows())[0]?.emailNextAttemptAt?.getTime()).toBeGreaterThan(Date.now())
    expect((await deliverNotificationEmails()).retried).toBe(0)
    expect(sink.attempts).toBe(1)
    sink.setMode("accept")
    await makeDue({ emailClaimToken: crypto.randomUUID() })
    expect((await deliverNotificationEmails()).sent).toBe(1)
    expect(sink.messages).toHaveLength(1)
    expect((await rows())[0]?.emailAttempts).toBe(2)
  })
  test("active leases are excluded until their due time", async () => {
    await enable()
    await queueViews()
    await getDb()
      .update(notification)
      .set({
        emailClaimToken: crypto.randomUUID(),
        emailNextAttemptAt: new Date(Date.now() + 90_000),
      })
    expect((await deliverNotificationEmails()).sent).toBe(0)
    expect(sink.messages).toHaveLength(0)
    await makeDue()
    expect((await deliverNotificationEmails()).sent).toBe(1)
  })
  test("fifth failures are terminal and old or exhausted jobs never send", async () => {
    await enable()
    await queueViews()
    sink.setMode("reject")
    await makeDue({ emailAttempts: 4 })
    expect((await deliverNotificationEmails()).failed).toBe(1)
    expect((await rows())[0]).toMatchObject({
      emailStatus: "failed",
      emailAttempts: 5,
      emailNextAttemptAt: null,
    })
    sink.setMode("accept")
    await queueViews("too-old")
    await getDb()
      .update(notification)
      .set({ createdAt: new Date(Date.now() - DAY - 1_000) })
      .where(eq(notification.emailStatus, "pending"))
    expect((await deliverNotificationEmails()).skipped).toBe(1)
    await queueViews("too-many")
    await getDb()
      .update(notification)
      .set({ emailAttempts: 5 })
      .where(eq(notification.emailStatus, "pending"))
    expect((await deliverNotificationEmails()).skipped).toBe(1)
    expect(sink.messages).toHaveLength(0)
  })
  test("opt-out and revoked verification after enqueue suppress delivery", async () => {
    await enable()
    await queueViews()
    await updateNotificationPreference({ kind: "views", channel: "email", enabled: false })
    expect((await deliverNotificationEmails()).skipped).toBe(1)
    await enable()
    await queueViews("unverified")
    await getDb().update(user).set({ emailVerified: false }).where(eq(user.id, "owner"))
    expect((await deliverNotificationEmails()).skipped).toBe(1)
    expect(
      (await updateNotificationPreference({ kind: "views", channel: "email", enabled: true })).ok,
    ).toBe(false)
    expect(sink.attempts).toBe(0)
  })
  test("revoked shares and rescheduled expiry suppress queued mail", async () => {
    await enable("shared")
    await enable("expiring")
    await seedPaste({ slug: "revoked", owner: "reader", visibility: "private" })
    signInAs("reader")
    await sharePaste("revoked", "owner", "view")
    await unsharePaste("revoked", "owner")
    const soon = await seedPaste({
      slug: "rescheduled",
      owner: "owner",
      expiresAt: new Date(Date.now() + 5 * 3_600_000),
    })
    await getDb()
      .update(paste)
      .set({ createdAt: new Date(Date.now() - 3 * DAY) })
      .where(eq(paste.id, soon.id))
    await notifyExpiringPastes()
    await getDb()
      .update(paste)
      .set({ expiresAt: new Date(Date.now() + 9 * 3_600_000) })
      .where(eq(paste.id, soon.id))
    expect((await deliverNotificationEmails()).skipped).toBe(1)
    expect(sink.attempts).toBe(0)
    expect(await rows()).toHaveLength(1)
  })
  test("SMTP is optional and enabling email without it fails", async () => {
    for (const key of envKeys.filter((key) => key.startsWith("SMTP_"))) delete process.env[key]
    expect(
      (await updateNotificationPreference({ kind: "views", channel: "email", enabled: true })).ok,
    ).toBe(false)
    expect(
      await updateNotificationPreference({ kind: "views", channel: "inApp", enabled: false }),
    ).toEqual({ ok: true })
    expect((await deliverNotificationEmails()).sent).toBe(0)
  })
  test("tokens reject tampering, expiry and previous email", async () => {
    const token = createUnsubscribeToken("owner", "owner@example.com", "views")
    expect(verifyUnsubscribeToken(token)?.kind).toBe("views")
    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull()
    expect(verifyUnsubscribeToken(`${token.split(".")[0]}x.${token.split(".")[1]}`)).toBeNull()
    expect(
      verifyUnsubscribeToken(
        createUnsubscribeToken("owner", "owner@example.com", "views", Date.now() - 31 * DAY),
      ),
    ).toBeNull()
    expect(await unsubscribeNotificationEmail("bad.token")).toBe(false)
    await getDb().update(user).set({ email: "new@example.com" }).where(eq(user.id, "owner"))
    expect(await unsubscribeNotificationEmail(token)).toBe(false)
  })
  test("GET never mutates and idempotent anonymous POST disables one email kind only", async () => {
    await enable()
    await enable("shared")
    const token = createUnsubscribeToken("owner", "owner@example.com", "views")
    const url = `http://localhost:3000/api/notifications/unsubscribe?token=${token}`
    signInAs(null)
    const response = await GET(new Request(url))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect((await readPreferences("owner")).notifications.views.email).toBe(true)
    for (let i = 0; i < 2; i++)
      expect((await POST(new Request(url, { method: "POST" }))).status).toBe(200)
    expect((await readPreferences("owner")).notifications).toMatchObject({
      views: { email: false, inApp: true },
      shared: { email: true, inApp: true },
    })
    expect(
      (
        await POST(
          new Request("http://localhost:3000/api/notifications/unsubscribe?token=invalid", {
            method: "POST",
          }),
        )
      ).status,
    ).toBe(400)
  })
  test("concurrent general settings and channel changes preserve unsubscribe", async () => {
    await enable()
    const token = createUnsubscribeToken("owner", "owner@example.com", "views")
    expect(
      await Promise.all([
        unsubscribeNotificationEmail(token),
        updatePreferences({ indentation: "4" }),
        updateNotificationPreference({ kind: "shared", channel: "email", enabled: true }),
        updateNotificationPreference({ kind: "burned", channel: "inApp", enabled: false }),
      ]),
    ).toEqual([true, { ok: true }, { ok: true }, { ok: true }])
    const current = await readPreferences("owner")
    expect(current.indentation).toBe("4")
    expect(current.notifications).toMatchObject({
      views: { email: false },
      shared: { email: true },
      burned: { inApp: false },
    })
  })
  test("a password user verifies their email through real auth and local SMTP", async () => {
    const config = getConfig()
    const smtp = config.smtp
    if (!smtp) throw new Error("missing test SMTP")
    const auth = createAuth({
      db: getDb(),
      secret: config.authSecret ?? "",
      baseURL: config.appUrl,
      rateLimitEnabled: false,
      emailVerification: { sendVerificationEmail: sendEmailVerification },
    })
    const signup = await auth.api.signUpEmail({
      body: {
        name: "Password User",
        email: "password@example.com",
        password: "a-long-password-123",
        username: "passworduser",
      },
    })
    expect(signup.user.emailVerified).toBe(false)
    expect(sink.messages).toHaveLength(0)
    await auth.api.sendVerificationEmail({
      body: { email: "password@example.com", callbackURL: "/settings?tab=notifications" },
    })
    expect(sink.messages).toHaveLength(1)
    for (let attempt = 0; attempt < 2; attempt++)
      await auth.api.sendVerificationEmail({
        body: { email: "password@example.com", callbackURL: "/settings?tab=notifications" },
      })
    await expect(
      auth.api.sendVerificationEmail({
        body: { email: "password@example.com", callbackURL: "/settings?tab=notifications" },
      }),
    ).rejects.toThrow(/wait before/)
    expect(sink.messages).toHaveLength(3)
    const encoded = sink.messages[0] ?? ""
    const message = encoded.replace(/=\r\n/g, "").replace(/=3D/g, "=")
    const link = message.match(/http:\/\/localhost:3000\/api\/auth\/verify-email\?[^\s]+/)?.[0]
    if (!link) throw new Error("missing verification URL")
    const response = await auth.handler(new Request(link))
    expect(response.status).toBe(302)
    const [account] = await getDb()
      .select()
      .from(user)
      .where(eq(user.email, "password@example.com"))
    expect(account?.emailVerified).toBe(true)
    signInAs(account?.id ?? null)
    await enable()
  })
  test("a forgotten password resets through real auth and local SMTP", async () => {
    const config = getConfig()
    const auth = createAuth({
      db: getDb(),
      secret: config.authSecret ?? "",
      baseURL: config.appUrl,
      rateLimitEnabled: false,
      sendResetPassword: sendPasswordReset,
    })
    await auth.api.signUpEmail({
      body: {
        name: "Forgetful",
        email: "forgetful@example.com",
        password: "the-old-password-1",
        username: "forgetful",
      },
    })
    const reset = (email: string) =>
      auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } })
    // The same answer for an address without an account, and no email for it.
    expect(await reset("nobody@example.com")).toEqual(await reset("forgetful@example.com"))
    for (let wait = 0; wait < 50 && sink.messages.length < 1; wait++) await Bun.sleep(20)
    await Bun.sleep(50)
    expect(sink.messages).toHaveLength(1)
    const message = (sink.messages[0] ?? "").replace(/=\r\n/g, "").replace(/=3D/g, "=")
    expect(message).toContain("To: forgetful@example.com")
    const link = message.match(/http:\/\/localhost:3000\/api\/auth\/reset-password\/[^\s]+/)?.[0]
    if (!link) throw new Error("missing reset URL")
    const landing = await auth.handler(new Request(link))
    expect(landing.status).toBe(302)
    const token = new URL(
      landing.headers.get("location") ?? "",
      "http://localhost:3000",
    ).searchParams.get("token")
    if (!token) throw new Error("missing reset token")
    await auth.api.resetPassword({ body: { newPassword: "the-new-password-2", token } })
    await expect(
      auth.api.resetPassword({ body: { newPassword: "a-third-password-3", token } }),
    ).rejects.toThrow()
    await expect(
      auth.api.signInEmail({
        body: { email: "forgetful@example.com", password: "the-old-password-1" },
      }),
    ).rejects.toThrow()
    const signedIn = await auth.api.signInEmail({
      body: { email: "forgetful@example.com", password: "the-new-password-2" },
    })
    expect(signedIn.user.email).toBe("forgetful@example.com")
    // Three links an hour per account; more requests answer the same and send nothing.
    for (let attempt = 0; attempt < 4; attempt++) await reset("forgetful@example.com")
    await Bun.sleep(300)
    expect(sink.messages).toHaveLength(3)
  })
  test("absolute SMTP deadline destroys the socket before lease expiry", async () => {
    await enable()
    await queueViews()
    sink.setMode("stall")
    const started = Date.now()
    expect((await deliverNotificationEmails()).retried).toBe(1)
    expect(Date.now() - started).toBeGreaterThanOrEqual(29_000)
    expect(Date.now() - started).toBeLessThan(40_000)
    await Bun.sleep(30)
    expect(sink.connections).toBe(0)
    expect((await rows())[0]).toMatchObject({
      emailStatus: "pending",
      emailAttempts: 1,
      emailClaimToken: null,
    })
  }, 45_000)
})
