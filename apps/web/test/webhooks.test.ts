import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { getConfig } from "@/lib/config"
import { shareToWebhook } from "@/lib/pastes/webhook-actions"
import { isWebhookUrl } from "@/lib/pastes/webhook-url"
import { sendWebhook } from "@/lib/pastes/webhooks"
import { hasDatabase, pasteRow, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

const SLACK = "https://hooks.slack.com/services/T123/B123/token"
const DISCORD = "https://discord.com/api/webhooks/123456/token"
const realFetch = globalThis.fetch
let calls: { url: string; init: RequestInit }[] = []

function serve(status = 200) {
  calls = []
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(null, { status })
  }) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.SLACK_WEBHOOK_URL
  delete process.env.DISCORD_WEBHOOK_URL
  delete process.env.SHARE_URL
})

describe("incoming webhook delivery", () => {
  test("validates exact HTTPS provider endpoints without echoing secrets", () => {
    expect(getConfig({ SLACK_WEBHOOK_URL: SLACK, DISCORD_WEBHOOK_URL: DISCORD }).webhooks).toEqual({
      slack: SLACK,
      discord: DISCORD,
    })
    for (const url of [
      "http://localhost/x",
      "https://hooks.slack.com.evil.test/services/T/B/token",
      `${SLACK}?secret=token`,
      "https://user:pass@hooks.slack.com/services/T/B/token",
      "https://hooks.slack.com:8443/services/T/B/token",
      "https://hooks.slack.com/other",
    ]) {
      expect(isWebhookUrl(url, "slack")).toBe(false)
      expect(() => getConfig({ SLACK_WEBHOOK_URL: url })).toThrow("SLACK_WEBHOOK_URL")
    }
    expect(isWebhookUrl(SLACK, "discord")).toBe(false)
  })

  test("Slack receives a link with escaped mentions and enabled unfurls", async () => {
    serve()
    expect(
      await sendWebhook(
        "slack",
        SLACK,
        { slug: "sample", title: "<!channel> & <https://bad.test>", visibility: "public" },
        "https://sniptide.com",
      ),
    ).toEqual({ ok: true })
    expect(calls[0]?.url).toBe(SLACK)
    const init = calls[0]?.init
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "&lt;!channel&gt; &amp; &lt;https://bad.test&gt;\nhttps://sniptide.com/sample",
      unfurl_links: true,
      unfurl_media: true,
    })
  })

  test("Discord receives a public preview embed and cannot ping anyone", async () => {
    serve(204)
    await sendWebhook(
      "discord",
      DISCORD,
      { slug: "sample", title: "@everyone", visibility: "public" },
      "https://sniptide.com",
    )
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      content: "https://sniptide.com/sample",
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "@everyone",
          url: "https://sniptide.com/sample",
          image: { url: "https://sniptide.com/sample/preview" },
        },
      ],
    })
    await sendWebhook(
      "discord",
      DISCORD,
      { slug: "unlisted", title: "Title", visibility: "unlisted" },
      "https://sniptide.com",
    )
    expect(JSON.parse(String(calls[1]?.init.body)).embeds[0]).not.toHaveProperty("image")
  })

  test("errors and timeouts stay generic and never retry", async () => {
    serve(429)
    expect(
      (
        await sendWebhook(
          "slack",
          SLACK,
          { slug: "sample", title: "Title", visibility: "public" },
          "https://sniptide.com",
        )
      ).ok,
    ).toBe(false)
    expect(calls).toHaveLength(1)
    globalThis.fetch = mock(async () => {
      throw new Error(SLACK)
    }) as unknown as typeof fetch
    const result = await sendWebhook(
      "slack",
      SLACK,
      { slug: "sample", title: "Title", visibility: "public" },
      "https://sniptide.com",
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(SLACK)
  })
})

const describeDb = hasDatabase ? describe : describe.skip
describeDb("webhook share authorization", () => {
  afterAll(resetDatabase)
  beforeEach(async () => {
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
    process.env.SLACK_WEBHOOK_URL = SLACK
    process.env.SHARE_URL = "https://sniptide.com"
    serve()
  })

  test("only owners send; public and unlisted sends leave views untouched", async () => {
    await seedPaste({ slug: "sample", owner: "owner", visibility: "public" })
    await seedPaste({ slug: "unlisted", owner: "owner" })
    for (const viewer of [null, "other"]) {
      signInAs(viewer)
      expect((await shareToWebhook("sample", "slack")).ok).toBe(false)
    }
    expect(calls).toHaveLength(0)
    signInAs("owner")
    expect(await shareToWebhook("sample", "slack")).toEqual({ ok: true })
    expect(await shareToWebhook("unlisted", "slack")).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
    expect((await pasteRow("sample"))?.views).toBe(0)
  })

  test("refuses protected, expired, deleted and missing pastes before delivery", async () => {
    await seedPaste({ slug: "private", owner: "owner", visibility: "private" })
    await seedPaste({ slug: "password", owner: "owner", visibility: "public", password: "secret" })
    await seedPaste({ slug: "burn", owner: "owner", visibility: "public", burnAfterRead: true })
    await seedPaste({
      slug: "expired",
      owner: "owner",
      visibility: "public",
      expiresAt: new Date(Date.now() - 1000),
    })
    await seedPaste({
      slug: "trashed",
      owner: "owner",
      visibility: "public",
      deletedAt: new Date(),
    })
    for (const slug of ["private", "password", "burn", "expired", "trashed", "missing"])
      expect((await shareToWebhook(slug, "slack")).ok).toBe(false)
    expect(calls).toHaveLength(0)
    expect((await pasteRow("burn"))?.deletedAt).toBeNull()
  })

  test("rejects unconfigured targets and limits sends across providers", async () => {
    await seedPaste({ slug: "sample", owner: "owner", visibility: "public" })
    expect((await shareToWebhook("sample", "discord")).ok).toBe(false)
    expect((await shareToWebhook("sample", "other" as never)).ok).toBe(false)
    process.env.DISCORD_WEBHOOK_URL = DISCORD
    for (let index = 0; index < 20; index++)
      expect((await shareToWebhook("sample", index % 2 ? "slack" : "discord")).ok).toBe(true)
    expect((await shareToWebhook("sample", "discord")).ok).toBe(false)
    expect(calls).toHaveLength(20)
  })
})
