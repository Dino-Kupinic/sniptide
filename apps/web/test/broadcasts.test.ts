import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createAuth } from "@workspace/auth"
import { broadcastSubscription, user } from "@workspace/db/schema"
import { createResendClient, ResendError } from "@workspace/email/resend"
import { eq } from "drizzle-orm"
import {
  followEmailChange,
  forgetAccount,
  hasProductEmails,
  setProductEmails,
  setResendClientForTests,
} from "@/lib/broadcasts/subscription"
import { getDb } from "@/lib/db"
import { hasDatabase, resetDatabase, seedUser } from "./harness"

type Call = { method: string; url: string; body?: unknown }

// A Resend stand-in that records each request and answers from a table of status codes.
function fakeFetch(statuses: Record<string, number> = {}) {
  const calls: Call[] = []
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const status = statuses[`${method} ${url.replace("https://api.resend.com", "")}`] ?? 200
    return new Response(JSON.stringify(status < 300 ? { id: "bc_1" } : { message: "nope" }), {
      status,
    })
  }) as typeof fetch
  return { calls, fetcher }
}

const config = { apiKey: "re_test", segmentId: "seg_1" }

describe("Resend client", () => {
  test("subscribing a new address creates the contact in the segment", async () => {
    const { calls, fetcher } = fakeFetch({ "PATCH /contacts/new%40example.com": 404 })
    await createResendClient(config, fetcher).subscribe("new@example.com")
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "PATCH https://api.resend.com/contacts/new%40example.com",
      "POST https://api.resend.com/contacts",
    ])
    expect(calls[1]?.body).toEqual({
      email: "new@example.com",
      unsubscribed: false,
      segments: [{ id: "seg_1" }],
    })
  })

  test("subscribing a known address resubscribes it and adds it to the segment", async () => {
    const { calls, fetcher } = fakeFetch()
    await createResendClient(config, fetcher).subscribe("old@example.com")
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "PATCH https://api.resend.com/contacts/old%40example.com",
      "POST https://api.resend.com/contacts/old%40example.com/segments/seg_1",
    ])
    expect(calls[0]?.body).toEqual({ unsubscribed: false })
  })

  test("unknown contacts are fine to unsubscribe or remove, and other errors surface", async () => {
    const { fetcher } = fakeFetch({
      "PATCH /contacts/gone%40example.com": 404,
      "DELETE /contacts/gone%40example.com": 404,
      "DELETE /contacts/bad%40example.com": 500,
    })
    const client = createResendClient(config, fetcher)
    await client.unsubscribe("gone@example.com")
    await client.remove("gone@example.com")
    await expect(client.remove("bad@example.com")).rejects.toBeInstanceOf(ResendError)
  })

  test("broadcasts go to the configured segment", async () => {
    const { calls, fetcher } = fakeFetch()
    const client = createResendClient(config, fetcher)
    const id = await client.createBroadcast({
      name: "n",
      from: "a@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    })
    await client.sendBroadcast(id, "tomorrow at 9am")
    expect(calls[0]?.body).toMatchObject({ segment_id: "seg_1", subject: "s" })
    expect(calls[1]).toMatchObject({
      url: "https://api.resend.com/broadcasts/bc_1/send",
      body: { scheduled_at: "tomorrow at 9am" },
    })
    expect(calls[0]?.url).toBe("https://api.resend.com/broadcasts")
  })
})

const describeDb = hasDatabase ? describe : describe.skip

describeDb("product update subscriptions", () => {
  let original: Record<string, string | undefined>
  let actions: string[]
  beforeEach(async () => {
    await resetDatabase()
    original = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      RESEND_SEGMENT_ID: process.env.RESEND_SEGMENT_ID,
    }
    process.env.RESEND_API_KEY = "re_test"
    process.env.RESEND_SEGMENT_ID = "seg_1"
    actions = []
    setResendClientForTests({
      subscribe: async (email) => {
        actions.push(`subscribe ${email}`)
      },
      unsubscribe: async (email) => {
        actions.push(`unsubscribe ${email}`)
      },
      remove: async (email) => {
        actions.push(`remove ${email}`)
      },
      createBroadcast: async () => "",
      sendBroadcast: async () => {},
      sendEmail: async () => {},
    })
  })
  afterEach(() => {
    setResendClientForTests(undefined)
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  afterAll(resetDatabase)

  const verify = (id: string) =>
    getDb().update(user).set({ emailVerified: true }).where(eq(user.id, id))

  test("only a verified address can turn product updates on", async () => {
    await seedUser("ada")
    expect(await setProductEmails("ada", true)).toMatchObject({ ok: false })
    expect(actions).toEqual([])
    await verify("ada")
    expect(await setProductEmails("ada", true)).toEqual({ ok: true })
    expect(await hasProductEmails("ada")).toBe(true)
    expect(await setProductEmails("ada", false)).toEqual({ ok: true })
    expect(await hasProductEmails("ada")).toBe(false)
    expect(actions).toEqual(["subscribe ada@example.com", "unsubscribe ada@example.com"])
  })

  test("the contact follows an email change and goes with the account", async () => {
    await seedUser("ada")
    await verify("ada")
    await setProductEmails("ada", true)
    await getDb().update(user).set({ email: "ada@new.example.com" }).where(eq(user.id, "ada"))
    await followEmailChange({ id: "ada", email: "ada@new.example.com" })
    await followEmailChange({ id: "ada", email: "ada@new.example.com" })
    const [row] = await getDb()
      .select()
      .from(broadcastSubscription)
      .where(eq(broadcastSubscription.userId, "ada"))
    expect(row?.email).toBe("ada@new.example.com")
    await forgetAccount({ id: "ada" })
    // Accounts that never opted in cost no request.
    await seedUser("bob")
    await followEmailChange({ id: "bob", email: "bob@example.com" })
    await forgetAccount({ id: "bob" })
    expect(actions).toEqual([
      "subscribe ada@example.com",
      "subscribe ada@new.example.com",
      "remove ada@example.com",
      "remove ada@new.example.com",
    ])
  })

  test("a failed Resend call leaves the switch where it was", async () => {
    await seedUser("ada")
    await verify("ada")
    setResendClientForTests({
      ...createResendClient(
        config,
        fakeFetch({ "PATCH /contacts/ada%40example.com": 500 }).fetcher,
      ),
    })
    expect(await setProductEmails("ada", true)).toMatchObject({ ok: false })
    expect(await hasProductEmails("ada")).toBe(false)
  })

  test("Better Auth reports email changes and deletions to the app", async () => {
    const seen: string[] = []
    const auth = createAuth({
      db: getDb(),
      secret: "test-secret-that-is-long-enough-for-better-auth",
      baseURL: "http://localhost:3000",
      rateLimitEnabled: false,
      afterUserUpdate: async ({ email }) => {
        seen.push(`updated ${email}`)
      },
      beforeUserDelete: async ({ email }) => {
        seen.push(`deleting ${email}`)
      },
    })
    const { user: created } = await auth.api.signUpEmail({
      body: { name: "Ada", email: "ada@example.com", password: "a-long-password-123" },
    })
    const context = await auth.$context
    await context.internalAdapter.updateUser(created.id, { email: "ada@new.example.com" })
    await context.internalAdapter.deleteUser(created.id)
    expect(seen).toContain("updated ada@new.example.com")
    expect(seen.at(-1)).toBe("deleting ada@new.example.com")
  })
})
