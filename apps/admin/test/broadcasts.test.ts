import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { render } from "@react-email/render"
import { migrateDb } from "@workspace/db/migrate"
import { broadcast, broadcastSubscription, user } from "@workspace/db/schema"
import { ResendError } from "@workspace/email/resend"
import { eq } from "drizzle-orm"
import { createElement } from "react"
import { type BroadcastContent, monthLabel, renderBroadcastEmail, safeUrl } from "@/lib/compose"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { Broadcast, Cover, ratingLinks } from "@/lib/email"
import { createSession, passwordMatches, validSession } from "@/lib/session"
import {
  cleanContent,
  cleanDetails,
  createDraft,
  getBroadcast,
  rowContent,
  saveDraft,
  sendTest,
  sendToSubscribers,
  setResendClientForTests,
} from "@/lib/store"

// The database tests run against TEST_DATABASE_URL, a database named *_test that they empty.
const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl && !/\/[A-Za-z0-9_-]+_test(\?.*)?$/.test(testDatabaseUrl))
  throw new Error("TEST_DATABASE_URL must name a database ending in _test.")
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeDb = testDatabaseUrl ? describe : describe.skip

// Only the rows these tests write, so the app's own test data is left alone.
async function resetDatabase() {
  await getDb().delete(broadcast)
  await getDb().delete(user).where(eq(user.id, "reader"))
}

describe("broadcast emails", () => {
  const props = {
    appUrl: "https://app.example.com",
    operator: { name: "Example GmbH", address: "Ring 1\n1010 Wien" },
  }
  const content: BroadcastContent = {
    kind: "update",
    details: {},
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
    expect(safeUrl("https://example.com/a.png")).toBe("https://example.com/a.png")
    expect(safeUrl("http://example.com/a.png")).toBeNull()
    expect(safeUrl("javascript:alert(1)")).toBeNull()
    expect(safeUrl("not a link")).toBeNull()
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
      meta: "November 21, 2026",
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

  test("details keep only the fields the templates know, clipped to their limits", () => {
    expect(
      cleanDetails({ heading: "h".repeat(300), minutes: 400, extra: "x", url: 5, question: "Q" }),
    ).toEqual({ heading: "h".repeat(120), question: "Q" })
    expect(cleanDetails({ minutes: "7" })).toEqual({ minutes: 7 })
    expect(cleanDetails(null)).toEqual({})
  })

  test("a survey shows its message, five one-click scores and the survey button", async () => {
    const survey: BroadcastContent = {
      kind: "survey",
      subject: "Two minutes for Sniptide?",
      preview: "Tell us what to build next",
      label: "",
      imageUrl: null,
      body: "We read every answer.",
      details: {
        heading: "Help shape Sniptide",
        url: "https://tally.so/r/abc?src=email",
        question: "How likely are you to recommend Sniptide?",
        minutes: 2,
      },
    }
    const { html, text } = await renderBroadcastEmail({ content: survey, date, ...props })
    expect(html).toContain("Help shape Sniptide")
    expect(html).toContain("We read every answer.")
    expect(html).toContain("How likely are you to recommend Sniptide?")
    for (const { href } of ratingLinks(survey.details.url ?? ""))
      expect(html).toContain(`href="${href.replace(/&/g, "&amp;")}"`)
    expect(ratingLinks("https://tally.so/r/abc?src=email")[4]?.href).toBe(
      "https://tally.so/r/abc?src=email&rating=5",
    )
    expect(html).toContain("Take the survey")
    expect(html).toContain("It takes about 2 minutes.")
    // The survey has no product update cover.
    expect(html).not.toContain("sniptide-mark-white.png")
    expect(text).toContain("https://tally.so/r/abc?src=email")
    // Without an https link there is nothing to answer, so no scores or button render.
    const broken = await renderBroadcastEmail({
      content: { ...survey, details: { ...survey.details, url: "http://tally.so/r/abc" } },
      date,
      ...props,
    })
    expect(broken.html).not.toContain("rating=")
    expect(broken.html).not.toContain("Take the survey")
  })

  test("a guide shows its title, topic, reading time, code and a link to read more", async () => {
    const guide: BroadcastContent = {
      kind: "guide",
      subject: "Share env files safely",
      preview: "Three ways to keep secrets out of chat",
      label: "Secrets",
      imageUrl: null,
      body: "Run this:\n\n```sh\nsniptide env pull my-app\n```",
      details: { url: "https://docs.sniptide.com/core-concepts/secrets", minutes: 4 },
    }
    const { html } = await renderBroadcastEmail({ content: guide, date, ...props })
    expect(html).toContain("Share env files safely")
    expect(html).toContain("Secrets · 4 min read")
    expect(html).toContain("sniptide env pull my-app")
    expect(html).toContain('href="https://docs.sniptide.com/core-concepts/secrets"')
    expect(html).toContain("Read the full guide")
  })
})

describe("configuration", () => {
  const base = {
    DATABASE_URL: "postgres://localhost/sniptide",
    APP_URL: "https://app.example.com",
    ADMIN_PASSWORD: "a-long-operator-password",
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "seg_1",
    BROADCAST_FROM: "Sniptide <updates@example.com>",
    BROADCAST_TEST_TO: "me@example.com",
  }

  test("reads the operator's sender line only when a name is set", () => {
    expect(getConfig(base).operator).toBeUndefined()
    expect(getConfig({ ...base, OPERATOR_NAME: "Example GmbH" }).operator).toEqual({
      name: "Example GmbH",
      address: undefined,
    })
  })

  test("refuses a short password and missing Resend settings", () => {
    expect(() => getConfig({ ...base, ADMIN_PASSWORD: "short" })).toThrow(/ADMIN_PASSWORD/)
    expect(() => getConfig({ ...base, RESEND_SEGMENT_ID: "" })).toThrow(/RESEND_SEGMENT_ID/)
  })
})

describe("sessions", () => {
  const password = "a-long-operator-password"

  test("a session is valid until it expires and only for the password that signed it", () => {
    const now = Date.UTC(2026, 10, 22)
    const session = createSession(password, now)
    expect(validSession(session, password, now + 1000)).toBe(true)
    expect(validSession(session, password, now + 31 * 24 * 3600 * 1000)).toBe(false)
    expect(validSession(session, "another-long-password", now)).toBe(false)
    expect(validSession(`${now + 10_000_000}.forged`, password, now)).toBe(false)
    expect(validSession(undefined, password, now)).toBe(false)
    expect(validSession("garbage", password, now)).toBe(false)
  })

  test("the password check compares the whole value", () => {
    expect(passwordMatches(password, password)).toBe(true)
    expect(passwordMatches(`${password} `, password)).toBe(false)
    expect(passwordMatches("", password)).toBe(false)
  })
})

describeDb("writing and sending emails", () => {
  const keys = [
    "RESEND_API_KEY",
    "RESEND_SEGMENT_ID",
    "BROADCAST_FROM",
    "BROADCAST_TEST_TO",
    "APP_URL",
    "ADMIN_PASSWORD",
    "OPERATOR_NAME",
    "OPERATOR_ADDRESS",
  ] as const
  let original: Record<string, string | undefined>
  let actions: string[]
  let failSend: boolean

  const env = {
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "seg_1",
    BROADCAST_FROM: "Sniptide <updates@example.com>",
    BROADCAST_TEST_TO: "writer@example.com",
    APP_URL: "https://app.example.com",
    ADMIN_PASSWORD: "a-long-operator-password",
    OPERATOR_NAME: "Example GmbH",
    OPERATOR_ADDRESS: "Ring 1",
  }

  beforeAll(async () => {
    original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    Object.assign(process.env, env)
    await migrateDb(getDb(), path.join(import.meta.dir, "../../../packages/db/migrations"))
  })

  beforeEach(async () => {
    Object.assign(process.env, env)
    await resetDatabase()
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
    const id = await createDraft()
    await saveDraft(id, { subject: "November", body: "## New\n\nThings shipped." })
    return id
  }

  test("a test goes to the writer with a marked subject", async () => {
    const id = await draft()
    expect(await sendTest(id)).toEqual({ ok: true })
    expect(actions).toEqual(["email writer@example.com [Test] November"])
  })

  test("an empty draft can't be sent", async () => {
    const id = await createDraft()
    expect(await sendTest(id)).toEqual({ ok: false, error: "noSubject" })
    await saveDraft(id, { subject: "November" })
    expect(await sendToSubscribers(id)).toEqual({ ok: false, error: "noBody" })
    expect(actions).toEqual([])
  })

  test("two sends at once send one broadcast, and a sent update no longer changes", async () => {
    const id = await draft()
    await getDb().insert(user).values({ id: "reader", name: "Reader", email: "reader@example.com" })
    await getDb()
      .insert(broadcastSubscription)
      .values({ userId: "reader", email: "reader@example.com" })
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

  test("each kind starts with its own words, and its details survive a save", async () => {
    const id = await createDraft("survey")
    const created = await getBroadcast(id)
    expect(created?.kind).toBe("survey")
    expect(created && rowContent(created).details.heading).toBe("Help shape Sniptide")
    await saveDraft(id, { details: { url: "https://tally.so/r/abc", minutes: 3 } })
    const saved = await getBroadcast(id)
    expect(saved && rowContent(saved).details).toEqual({
      url: "https://tally.so/r/abc",
      minutes: 3,
    })
    expect((await getBroadcast(await createDraft("guide")))?.label).toBe("Guide")
  })

  test("a survey can't be sent without a link to answer it", async () => {
    const id = await createDraft("survey")
    await saveDraft(id, { subject: "Feedback", body: "Tell us." })
    expect(await sendTest(id)).toEqual({ ok: false, error: "noUrl" })
    await saveDraft(id, { details: { url: "https://tally.so/r/abc" } })
    expect(await sendTest(id)).toEqual({ ok: true })
  })

  test("an email won't go out without a named sender", async () => {
    const id = await draft()
    delete process.env.OPERATOR_NAME
    expect(await sendToSubscribers(id)).toEqual({ ok: false, error: "noOperator" })
    const [row] = await getDb().select().from(broadcast)
    expect(row?.sentAt).toBeNull()
    expect(actions).toEqual([])
  })
})
