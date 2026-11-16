import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { integrationConnection, paste } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { GET as callback } from "@/app/api/integrations/[provider]/callback/route"
import { getDb } from "@/lib/db"
import {
  connectIntegration,
  disconnectIntegration,
  listExportDestinations,
  sendToDestination,
} from "@/lib/integrations/actions"
import { exportReveal } from "@/lib/integrations/exports"
import { slackMessage } from "@/lib/integrations/slack"
import { listIntegrations } from "@/lib/integrations/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Sending a paste to a Slack channel through a connected workspace. Only Slack's answers are faked.

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-long-enough-for-better-auth"

const describeDb = hasDatabase ? describe : describe.skip
const realFetch = globalThis.fetch
const ORIGIN = "http://localhost:3000"
const TOKEN = "xoxb-bot"

interface Call {
  method: string
  authorization: string | null
  body: URLSearchParams
}

// A stand-in Slack Web API. `post` is the error chat.postMessage answers with, if any. Any token
// other than TOKEN is refused the way Slack refuses a revoked one.
function serveSlack(options: { post?: string; pages?: number } = {}) {
  const calls: Call[] = []
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = url.pathname.replace("/api/", "")
    const authorization = new Headers(init?.headers).get("authorization")
    const body = new URLSearchParams(String(init?.body ?? ""))
    calls.push({ method, authorization, body })
    if (method === "oauth.v2.access")
      return Response.json({
        ok: true,
        access_token: TOKEN,
        token_type: "bot",
        scope: "chat:write,chat:write.public,channels:read,groups:read",
        team: { id: "T123", name: "Acme" },
      })
    if (authorization !== `Bearer ${TOKEN}`)
      return Response.json({ ok: false, error: "invalid_auth" })
    if (method === "auth.test") return Response.json({ ok: true, team_id: "T123", team: "Acme" })
    if (method === "auth.revoke") return Response.json({ ok: true, revoked: true })
    if (method === "conversations.list") {
      const page = Number(body.get("cursor") ?? "1")
      const last = page >= (options.pages ?? 2)
      return Response.json({
        ok: true,
        channels:
          page === 1
            ? [
                { id: "C2", name: "random", is_private: false },
                { id: "C9", name: "old", is_archived: true },
              ]
            : [{ id: "G1", name: "deploys", is_private: true }],
        response_metadata: { next_cursor: last ? "" : String(page + 1) },
      })
    }
    if (method === "chat.postMessage")
      return Response.json(options.post ? { ok: false, error: options.post } : { ok: true })
    return Response.json({ ok: false, error: "unknown_method" })
  }) as unknown as typeof fetch
  return calls
}

async function connect() {
  const error = await connectIntegration("slack").then(
    () => null,
    (caught: unknown) => caught,
  )
  const authorize = new URL(((error as { digest?: string }).digest ?? "").split(";")[2] ?? "")
  const response = await callback(
    new Request(
      `${ORIGIN}/api/integrations/slack/callback?code=the-code&state=${authorize.searchParams.get("state")}`,
    ),
    { params: Promise.resolve({ provider: "slack" }) },
  )
  expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?tab=integrations`)
  return authorize
}

const posts = (calls: Call[]) => calls.filter((call) => call.method === "chat.postMessage")

describe("what a destination receives", () => {
  const base = {
    visibility: "unlisted",
    passwordHash: null,
    burnAfterRead: false,
    encryptionKeyId: null,
  } as const

  test("the title goes along only when anyone with the link could read it", () => {
    expect(exportReveal({ ...base, visibility: "public" })).toBe("details")
    expect(exportReveal(base)).toBe("details")
    expect(exportReveal({ ...base, visibility: "private" })).toBe("link")
    expect(exportReveal({ ...base, passwordHash: "hash" })).toBe("link")
    expect(exportReveal({ ...base, burnAfterRead: true })).toBe("link")
    expect(exportReveal({ ...base, encryptionKeyId: "key" })).toBeNull()
  })

  test("a Slack message can't be turned into a mention or another link by the title", () => {
    expect(
      slackMessage({
        url: "https://s.test/a",
        title: "<!channel> & <https://x|y>",
        language: "ts",
      }),
    ).toEqual({
      text: "<https://s.test/a|&lt;!channel&gt; &amp; &lt;https://x|y&gt;> · ts",
      unfurl_links: "true",
    })
    expect(slackMessage({ url: "https://s.test/a", title: null, language: null })).toEqual({
      text: "<https://s.test/a>",
      unfurl_links: "false",
    })
  })
})

describeDb("Slack", () => {
  afterAll(resetDatabase)
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.SLACK_CLIENT_ID
    delete process.env.SLACK_CLIENT_SECRET
  })
  beforeEach(async () => {
    process.env.SLACK_CLIENT_ID = "slack-client"
    process.env.SLACK_CLIENT_SECRET = "slack-secret"
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
  })

  test("connecting installs the app in a workspace without PKCE and with comma-separated scopes", async () => {
    const calls = serveSlack()
    const authorize = await connect()
    expect(`${authorize.origin}${authorize.pathname}`).toBe("https://slack.com/oauth/v2/authorize")
    expect(authorize.searchParams.get("scope")).toBe(
      "chat:write,chat:write.public,channels:read,groups:read",
    )
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/integrations/slack/callback`,
    )
    expect(authorize.searchParams.has("code_challenge")).toBe(false)
    expect(calls[0]?.body.has("code_verifier")).toBe(false)
    expect(calls[0]?.body.get("client_secret")).toBe("slack-secret")

    const slack = (await listIntegrations("owner")).find((item) => item.id === "slack")
    expect(slack).toMatchObject({ available: true, connection: { account: "Acme" } })
  })

  test("lists public and invited private channels by name, across pages, without archived ones", async () => {
    serveSlack()
    await connect()
    expect(await listExportDestinations("slack")).toEqual({
      ok: true,
      destinations: [
        { id: "G1", name: "deploys", private: true },
        { id: "C2", name: "random", private: false },
      ],
    })
  })

  test("sends the title, language and link of a paste open to anyone with the link", async () => {
    const calls = serveSlack()
    await connect()
    await seedPaste({ slug: "notes", owner: "owner", title: "Deploy notes" })
    await getDb().update(paste).set({ firstLanguage: "shell" }).where(eq(paste.slug, "notes"))

    expect(await sendToDestination("slack", "notes", "C2")).toEqual({ ok: true })
    const [post] = posts(calls)
    expect(post?.authorization).toBe(`Bearer ${TOKEN}`)
    expect(Object.fromEntries(post?.body ?? [])).toEqual({
      channel: "C2",
      text: `<${ORIGIN}/notes|Deploy notes> · Shell`,
      unfurl_links: "true",
    })
  })

  test("sends only the link of a private or protected paste, and nothing of an encrypted one", async () => {
    const calls = serveSlack()
    await connect()
    await seedPaste({ slug: "mine", owner: "owner", visibility: "private", title: "Salaries" })
    await seedPaste({ slug: "locked", owner: "owner", password: "hunter22", title: "Keys" })
    await seedPaste({ slug: "sealed", owner: "owner" })
    await getDb().update(paste).set({ encryptionKeyId: "k1" }).where(eq(paste.slug, "sealed"))

    expect(await sendToDestination("slack", "mine", "C2")).toEqual({ ok: true })
    expect(await sendToDestination("slack", "locked", "C2")).toEqual({ ok: true })
    expect(posts(calls).map((call) => call.body.get("text"))).toEqual([
      `<${ORIGIN}/mine>`,
      `<${ORIGIN}/locked>`,
    ])
    expect(await sendToDestination("slack", "sealed", "C2")).toEqual({
      ok: false,
      error: "That paste can't be sent anywhere.",
    })
    expect(posts(calls)).toHaveLength(2)
  })

  test("only the owner sends a paste, and only a live one", async () => {
    const calls = serveSlack()
    await connect()
    await seedPaste({ slug: "theirs", owner: "other", visibility: "public" })
    await seedPaste({ slug: "gone", owner: "owner", deletedAt: new Date() })
    const refused = { ok: false as const, error: "That paste can't be sent anywhere." }
    expect(await sendToDestination("slack", "theirs", "C2")).toEqual(refused)
    expect(await sendToDestination("slack", "gone", "C2")).toEqual(refused)
    expect(posts(calls)).toHaveLength(0)
  })

  test("a channel the app can't post in says how to fix it", async () => {
    serveSlack({ post: "not_in_channel" })
    await connect()
    await seedPaste({ slug: "notes", owner: "owner" })
    expect(await sendToDestination("slack", "notes", "G7")).toEqual({
      ok: false,
      error: "Sniptide can't post in that channel. Invite the Sniptide app to it, then try again.",
    })
  })

  test("a revoked token drops the connection, and without one nothing is sent", async () => {
    serveSlack({ post: "token_revoked" })
    await connect()
    await seedPaste({ slug: "notes", owner: "owner" })
    const disconnected = {
      ok: false as const,
      error: "That connection stopped working. Connect it again in Settings.",
    }
    expect(await sendToDestination("slack", "notes", "C2")).toEqual(disconnected)
    expect(await getDb().select().from(integrationConnection)).toHaveLength(0)
    expect(await listExportDestinations("slack")).toEqual(disconnected)
  })

  test("disconnecting revokes the bot token at Slack", async () => {
    const calls = serveSlack()
    await connect()
    expect(await disconnectIntegration("slack")).toEqual({ ok: true })
    const revoke = calls.find((call) => call.method === "auth.revoke")
    expect(revoke?.authorization).toBe(`Bearer ${TOKEN}`)
    expect(await getDb().select().from(integrationConnection)).toHaveLength(0)
  })
})
