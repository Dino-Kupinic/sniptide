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
import { linearAttachment } from "@/lib/integrations/linear"
import { listIntegrations } from "@/lib/integrations/store"
import { hasDatabase, resetDatabase, seedPaste, seedUser, signInAs } from "./harness"

// Attaching a paste to a Linear issue through a connected workspace. Only Linear's answers are
// faked.

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-long-enough-for-better-auth"

const describeDb = hasDatabase ? describe : describe.skip
const realFetch = globalThis.fetch
const ORIGIN = "http://localhost:3000"
const TOKEN = "lin_oauth_token"

interface Call {
  url: string
  authorization: string | null
  body: string
}

// A stand-in for Linear's OAuth and GraphQL endpoints. `attach` is the error the attachment
// mutation answers with, if any.
function serveLinear(options: { attach?: "auth" | "missing" } = {}) {
  const calls: Call[] = []
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const authorization = new Headers(init?.headers).get("authorization")
    const body = String(init?.body ?? "")
    calls.push({ url, authorization, body })
    if (url === "https://api.linear.app/oauth/token")
      return Response.json({
        access_token: TOKEN,
        refresh_token: "lin_refresh",
        expires_in: 86_400,
        scope: "read,issues:create",
      })
    if (url === "https://api.linear.app/oauth/revoke") return new Response(null, { status: 200 })
    if (authorization !== `Bearer ${TOKEN}`)
      return Response.json(
        {
          errors: [
            { message: "Authentication required", extensions: { code: "AUTHENTICATION_ERROR" } },
          ],
        },
        { status: 401 },
      )
    const { query } = JSON.parse(body) as { query: string }
    if (query.includes("viewer"))
      return Response.json({ data: { viewer: { id: "user-1", organization: { name: "Acme" } } } })
    if (query.includes("SniptideIssues"))
      return Response.json({
        data: {
          issues: {
            nodes: [
              {
                id: "issue-1",
                identifier: "ENG-12",
                title: "Fix the deploy",
                team: { private: false },
              },
              { id: "issue-2", identifier: "SEC-3", title: "Rotate keys", team: { private: true } },
            ],
          },
        },
      })
    if (query.includes("attachmentCreate")) {
      if (options.attach === "auth")
        return Response.json({
          errors: [{ message: "Invalid token", extensions: { type: "authentication error" } }],
        })
      if (options.attach === "missing")
        return Response.json({
          errors: [{ message: "Entity not found", extensions: { code: "INVALID_INPUT" } }],
        })
      return Response.json({ data: { attachmentCreate: { success: true } } })
    }
    return Response.json({ errors: [{ message: "Unknown query" }] })
  }) as unknown as typeof fetch
  return calls
}

async function connect() {
  const error = await connectIntegration("linear").then(
    () => null,
    (caught: unknown) => caught,
  )
  const authorize = new URL(((error as { digest?: string }).digest ?? "").split(";")[2] ?? "")
  const response = await callback(
    new Request(
      `${ORIGIN}/api/integrations/linear/callback?code=the-code&state=${authorize.searchParams.get("state")}`,
    ),
    { params: Promise.resolve({ provider: "linear" }) },
  )
  expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?tab=integrations`)
  return authorize
}

const attachments = (calls: Call[]) =>
  calls
    .filter((call) => call.body.includes("attachmentCreate"))
    .map((call) => (JSON.parse(call.body) as { variables: { input: unknown } }).variables.input)

describe("the Linear attachment", () => {
  test("uses a generic title when the paste only allows the link", () => {
    expect(
      linearAttachment("issue-1", {
        url: "https://s.test/a",
        title: null,
        language: null,
        files: null,
      }),
    ).toEqual({
      issueId: "issue-1",
      url: "https://s.test/a",
      title: "Sniptide paste",
      iconUrl: "https://s.test/web-app-manifest-192x192.png",
    })
  })
})

describeDb("Linear", () => {
  afterAll(resetDatabase)
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.LINEAR_CLIENT_ID
    delete process.env.LINEAR_CLIENT_SECRET
  })
  beforeEach(async () => {
    process.env.LINEAR_CLIENT_ID = "linear-client"
    process.env.LINEAR_CLIENT_SECRET = "linear-secret"
    await resetDatabase()
    await seedUser("owner")
    signInAs("owner")
  })

  test("connecting asks to read and to create attachments, with PKCE", async () => {
    const calls = serveLinear()
    const authorize = await connect()
    expect(`${authorize.origin}${authorize.pathname}`).toBe("https://linear.app/oauth/authorize")
    expect(authorize.searchParams.get("scope")).toBe("read,issues:create")
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256")
    expect(new URLSearchParams(calls[0]?.body).has("code_verifier")).toBe(true)
    const linear = (await listIntegrations("owner")).find((item) => item.id === "linear")
    expect(linear).toMatchObject({ available: true, connection: { account: "Acme" } })
  })

  test("lists the user's open issues with their identifiers", async () => {
    serveLinear()
    await connect()
    expect(await listExportDestinations("linear")).toEqual({
      ok: true,
      destinations: [
        { id: "issue-1", name: "Fix the deploy", detail: "ENG-12", private: false },
        { id: "issue-2", name: "Rotate keys", detail: "SEC-3", private: true },
      ],
    })
  })

  test("attaches the title, language and link of a paste open to anyone with the link", async () => {
    const calls = serveLinear()
    await connect()
    await seedPaste({ slug: "notes", owner: "owner", title: "Deploy notes" })
    await getDb().update(paste).set({ firstLanguage: "shell" }).where(eq(paste.slug, "notes"))
    await seedPaste({ slug: "mine", owner: "owner", visibility: "private", title: "Salaries" })

    expect(await sendToDestination("linear", "notes", "issue-1")).toEqual({ ok: true })
    expect(await sendToDestination("linear", "mine", "issue-1")).toEqual({ ok: true })
    expect(attachments(calls)).toEqual([
      {
        issueId: "issue-1",
        url: `${ORIGIN}/notes`,
        title: "Deploy notes",
        subtitle: "Shell",
        iconUrl: `${ORIGIN}/web-app-manifest-192x192.png`,
      },
      {
        issueId: "issue-1",
        url: `${ORIGIN}/mine`,
        title: "Sniptide paste",
        iconUrl: `${ORIGIN}/web-app-manifest-192x192.png`,
      },
    ])
  })

  test("an issue Linear can't find says so", async () => {
    serveLinear({ attach: "missing" })
    await connect()
    await seedPaste({ slug: "notes", owner: "owner" })
    expect(await sendToDestination("linear", "notes", "issue-9")).toEqual({
      ok: false,
      error: "Linear couldn't find that issue. Pick another one and try again.",
    })
  })

  test("a refused token drops the connection", async () => {
    serveLinear({ attach: "auth" })
    await connect()
    await seedPaste({ slug: "notes", owner: "owner" })
    expect(await sendToDestination("linear", "notes", "issue-1")).toEqual({
      ok: false,
      error: "That connection stopped working. Connect it again in Settings.",
    })
    expect(await getDb().select().from(integrationConnection)).toHaveLength(0)
  })

  test("disconnecting revokes the token at Linear", async () => {
    const calls = serveLinear()
    await connect()
    expect(await disconnectIntegration("linear")).toEqual({ ok: true })
    const revoke = calls.find((call) => call.url === "https://api.linear.app/oauth/revoke")
    expect(new URLSearchParams(revoke?.body).get("token")).toBe(TOKEN)
  })
})
