import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { render } from "@react-email/render"
import { createAuth } from "@workspace/auth"
import { broadcast, broadcastSubscription, user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { createElement } from "react"
import { monthLabel, renderBroadcastEmail, safeImageUrl } from "@/lib/broadcasts/compose"
import { createResendClient, ResendError } from "@/lib/broadcasts/resend"
import {
  broadcastSender,
  cleanContent,
  createDraft,
  getBroadcast,
  saveDraft,
  sendTest,
  sendToSubscribers,
} from "@/lib/broadcasts/store"
import {
  followEmailChange,
  forgetAccount,
  hasProductEmails,
  setProductEmails,
  setResendClientForTests,
} from "@/lib/broadcasts/subscription"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { Broadcast, Cover } from "@/lib/email/broadcast"
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

describe("broadcast emails", () => {
  const props = {
    appUrl: "https://app.example.com",
    operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien" },
  }
  const content = {
    subject: "Sniptide in November",
    preview: "Collections and a faster editor",
    label: "November 2026",
    imageUrl: "https://app.example.com/email/shot.png",
    body: "## Collections\n\nGroup pastes into **collections**.\n\n- Drag to reorder\n- Share a whole set\n\n[Open Sniptide](https://sniptide.com)",
  }
  const date = new Date("2026-11-21T09:00:00Z")

  test("render with an unsubscribe link, the sender and readable plain text", async () => {
    const { subject, html, text } = await renderBroadcastEmail({ content, date, ...props })
    expect(subject).toBe(content.subject)
    expect(html).toContain('href="{{{RESEND_UNSUBSCRIBE_URL}}}"')
    expect(html).toContain("Sniptide product updates")
    expect(html).toContain("November 21, 2026")
    expect(html).toContain("https://app.example.com/email/fonts/archivo-700.woff2")
    expect(text).toContain("Sniptide product updates")
    expect(text).not.toContain("SNIPTIDE PRODUCT UPDATES")
    expect(text).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}")
    expect(text).toContain("Sent by Example GmbH, Ring 1, 1010 Wien.")
  })

  test("the Markdown body becomes styled headings, lists and links", async () => {
    const { html, text } = await renderBroadcastEmail({ content, date, ...props })
    expect(html).toContain('class="st-md"')
    expect(html).toMatch(/<h2[^>]*>Collections<\/h2>/)
    expect(html).toMatch(/<strong[^>]*>collections<\/strong>/)
    expect(html).toMatch(/<li[^>]*>Drag to reorder<\/li>/)
    expect(html).toContain('href="https://sniptide.com"')
    expect(html).toContain('src="https://app.example.com/email/shot.png"')
    // Headings keep their case in the plain-text part.
    expect(text).toContain("Collections")
    expect(text).not.toContain("COLLECTIONS")
  })

  test("a screenshot loads only over https", async () => {
    expect(safeImageUrl("https://example.com/a.png")).toBe("https://example.com/a.png")
    expect(safeImageUrl("http://example.com/a.png")).toBeNull()
    expect(safeImageUrl("javascript:alert(1)")).toBeNull()
    expect(safeImageUrl("not a link")).toBeNull()
    const { html } = await renderBroadcastEmail({
      content: { ...content, imageUrl: "http://example.com/a.png" },
      date,
      ...props,
    })
    expect(html).not.toContain("http://example.com/a.png")
    expect(html).not.toContain('class="st-stack"')
  })

  test("a new draft's cover label names the month", () => {
    expect(monthLabel(date)).toBe("November 2026")
  })

  test("the header shows the date, a browser link and a cover with the mark and a screenshot", async () => {
    const element = createElement(Broadcast, {
      ...props,
      subject: "Updates",
      preview: "What changed this month",
      title: "Sniptide product updates",
      date: "November 21, 2026",
      browserUrl: "https://sniptide.com/changelog/2026-11",
      children: createElement(Cover, {
        appUrl: props.appUrl,
        label: "November 2026",
        title: "Product updates",
        image: { src: "https://app.example.com/email/shot.png", alt: "The editor" },
      }),
    })
    const html = await render(element)
    const text = await render(element, { plainText: true })
    expect(html).toContain('href="https://sniptide.com/changelog/2026-11"')
    expect(html).toContain("View in browser")
    expect(html).toContain('src="https://app.example.com/email/sniptide-mark-white.png"')
    expect(html).toContain('alt="The editor"')
    expect(html).toContain('class="st-stack"')
    // The cover's words are text, so they show when images are blocked and in the plain text.
    expect(text).toContain("November 2026")
    expect(text).toContain("Product updates")
    // Without a screenshot the panel spans the width and nothing stacks.
    const bare = await render(createElement(Cover, { title: "Product updates" }))
    expect(bare).not.toContain("st-stack")
    expect(bare).not.toContain("<img")
  })

  test("drafts clip each field to its limit", () => {
    const clean = cleanContent({
      subject: "s".repeat(500),
      label: "l".repeat(100),
      body: "b".repeat(60_000),
      imageUrl: "  ",
    })
    expect(clean.subject).toHaveLength(200)
    expect(clean.label).toHaveLength(60)
    expect(clean.body).toHaveLength(50_000)
    expect(clean.imageUrl).toBeNull()
    expect(cleanContent({ preview: "p" })).toEqual({ preview: "p" })
  })
})

describe("broadcast configuration", () => {
  const base = {
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "seg_1",
    BROADCAST_FROM: "Sniptide <updates@example.com>",
  }

  test("senders are a trimmed, lowercased list", () => {
    const config = getConfig({ ...base, BROADCAST_SENDERS: " Dana@Example.com , ops@example.com," })
    expect(config.broadcasts?.senders).toEqual(["dana@example.com", "ops@example.com"])
  })

  test("senders need Resend and a from address", () => {
    expect(() => getConfig({ BROADCAST_SENDERS: "dana@example.com" })).toThrow(/BROADCAST_SENDERS/)
    expect(() =>
      getConfig({ ...base, BROADCAST_FROM: undefined, BROADCAST_SENDERS: "dana@example.com" }),
    ).toThrow(/BROADCAST_FROM/)
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

describeDb("writing and sending product updates", () => {
  const keys = [
    "RESEND_API_KEY",
    "RESEND_SEGMENT_ID",
    "BROADCAST_FROM",
    "BROADCAST_SENDERS",
    "OPERATOR_NAME",
    "OPERATOR_ADDRESS",
  ] as const
  let original: Record<string, string | undefined>
  let actions: string[]
  let failSend: boolean

  beforeEach(async () => {
    await resetDatabase()
    original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    Object.assign(process.env, {
      RESEND_API_KEY: "re_test",
      RESEND_SEGMENT_ID: "seg_1",
      BROADCAST_FROM: "Sniptide <updates@example.com>",
      BROADCAST_SENDERS: "writer@example.com",
      OPERATOR_NAME: "Example GmbH",
      OPERATOR_ADDRESS: "Ring 1",
    })
    actions = []
    failSend = false
    setResendClientForTests({
      subscribe: async () => {},
      unsubscribe: async () => {},
      remove: async () => {},
      createBroadcast: async (input) => {
        actions.push(`create ${input.subject}`)
        return "bc_9"
      },
      sendBroadcast: async (id) => {
        // Slow enough that a second click lands while the first send is still out.
        await new Promise((resolve) => setTimeout(resolve, 20))
        if (failSend) throw new ResendError(500, "down")
        actions.push(`send ${id}`)
      },
      sendEmail: async (input) => {
        actions.push(`email ${input.to} ${input.subject}`)
      },
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

  async function draft() {
    const writer = await seedUser("writer")
    const id = await createDraft(writer)
    await saveDraft(id, { subject: "November", body: "## New\n\nThings shipped." })
    return id
  }

  test("only a listed, verified address can write updates", () => {
    expect(broadcastSender({ email: "Writer@example.com", emailVerified: true })).toBe(true)
    expect(broadcastSender({ email: "writer@example.com", emailVerified: false })).toBe(false)
    expect(broadcastSender({ email: "other@example.com", emailVerified: true })).toBe(false)
  })

  test("a test goes to the writer with a marked subject", async () => {
    const id = await draft()
    expect(await sendTest(id, "writer@example.com")).toEqual({ ok: true })
    expect(actions).toEqual(["email writer@example.com [Test] November"])
  })

  test("an empty draft can't be sent", async () => {
    const writer = await seedUser("writer")
    const id = await createDraft(writer)
    expect(await sendTest(id, "writer@example.com")).toEqual({ ok: false, error: "noSubject" })
    await saveDraft(id, { subject: "November" })
    expect(await sendToSubscribers(id)).toEqual({ ok: false, error: "noBody" })
    expect(actions).toEqual([])
  })

  test("two sends at once send one broadcast, and a sent update no longer changes", async () => {
    const id = await draft()
    await getDb()
      .insert(broadcastSubscription)
      .values({ userId: "writer", email: "writer@example.com" })
    const results = await Promise.all([sendToSubscribers(id), sendToSubscribers(id)])
    expect(results).toContainEqual({ ok: true })
    expect(results).toContainEqual({ ok: false, error: "alreadySent" })
    expect(actions).toEqual(["create November", "send bc_9"])
    const row = await getBroadcast(id)
    expect(row?.sentAt).toBeInstanceOf(Date)
    expect(row?.providerId).toBe("bc_9")
    expect(row?.recipients).toBe(1)
    expect(await saveDraft(id, { subject: "Changed" })).toBe(false)
    expect((await getBroadcast(id))?.subject).toBe("November")
  })

  test("a failed send leaves the draft ready to try again", async () => {
    const id = await draft()
    failSend = true
    expect(await sendToSubscribers(id)).toEqual({ ok: false, error: "sendFailed" })
    expect((await getBroadcast(id))?.sentAt).toBeNull()
    failSend = false
    expect(await sendToSubscribers(id)).toEqual({ ok: true })
  })

  test("an update won't go out without a named sender", async () => {
    const id = await draft()
    delete process.env.OPERATOR_NAME
    expect(await sendToSubscribers(id)).toEqual({ ok: false, error: "noOperator" })
    const [row] = await getDb().select().from(broadcast)
    expect(row?.sentAt).toBeNull()
    expect(actions).toEqual([])
  })
})
