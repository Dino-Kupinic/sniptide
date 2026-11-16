import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { integrationConnection } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { GET as githubCallback } from "@/app/api/auth/callback/github/integration/route"
import { GET as callback } from "@/app/api/integrations/[provider]/callback/route"
import { getDb } from "@/lib/db"
import {
  connectIntegration,
  disconnectIntegration,
  listImportable,
} from "@/lib/integrations/actions"
import { STATE_COOKIE } from "@/lib/integrations/oauth"
import { accessToken, listIntegrations, saveConnection } from "@/lib/integrations/store"
import { previewImport } from "@/lib/pastes/actions"
import { seal, unseal } from "@/lib/sealed"
import { hasDatabase, request, resetDatabase, seedUser, signInAs } from "./harness"

// Connecting an external account, using it to import, and disconnecting it. GitHub is the
// provider, and only its answers are faked.

process.env.BETTER_AUTH_SECRET = "test-secret-that-is-long-enough-for-better-auth"

const describeDb = hasDatabase ? describe : describe.skip
const realFetch = globalThis.fetch
// The server's own GitHub token would stand in for a missing connection, so the tests run without.
const serverToken = process.env.GITHUB_TOKEN
const GIST = "aa11bb22cc33dd44ee55"
const ORIGIN = "http://localhost:3000"

interface Call {
  url: string
  method: string
  authorization: string | null
  body: string
}

// A stand-in GitHub. `tokens` is what the token endpoint answers with, and `accepts` is the access
// token the API takes: any other one gets 401.
function serveGitHub(options: { tokens?: unknown; accepts?: string } = {}) {
  const calls: Call[] = []
  const accepts = options.accepts ?? "gho_access"
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const authorization = headers.get("authorization")
    calls.push({
      url,
      method: init?.method ?? "GET",
      authorization,
      body: String(init?.body ?? ""),
    })
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json(options.tokens ?? { access_token: accepts, scope: "gist" })
    if (init?.method === "DELETE") return new Response(null, { status: 204 })
    if (authorization && authorization !== `Bearer ${accepts}`)
      return Response.json({ message: "Bad credentials" }, { status: 401 })
    if (url === "https://api.github.com/user")
      return Response.json({ id: 583231, login: "octocat" })
    if (url.startsWith("https://api.github.com/gists?"))
      return Response.json([
        {
          id: GIST,
          description: "  Deploy notes ",
          public: false,
          updated_at: "2026-10-01T12:00:00Z",
          files: { "a.md": { filename: "a.md" }, "b.sh": { filename: "b.sh" } },
        },
      ])
    if (url === `https://api.github.com/gists/${GIST}`)
      return Response.json({
        description: "Deploy notes",
        owner: { login: "octocat" },
        files: { "a.md": { filename: "a.md", content: "# hi" } },
      })
    return new Response("missing", { status: 404 })
  }) as unknown as typeof fetch
  return calls
}

// Starts a connection the way the Connect button does, and returns where the browser is sent.
async function start(provider = "github") {
  const error = await connectIntegration(provider).then(
    () => null,
    (caught: unknown) => caught,
  )
  const digest = (error as { digest?: string } | null)?.digest ?? ""
  expect(digest).toStartWith("NEXT_REDIRECT")
  return new URL(digest.split(";")[2] ?? "")
}

const comeBack = (query: string) =>
  githubCallback(new Request(`${ORIGIN}/api/auth/callback/github/integration?${query}`))

async function connect() {
  const authorize = await start()
  const response = await comeBack(`code=the-code&state=${authorize.searchParams.get("state")}`)
  expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?tab=integrations`)
}

const row = async (user = "owner") =>
  (
    await getDb().select().from(integrationConnection).where(eq(integrationConnection.userId, user))
  )[0]

describe("sealed values", () => {
  test("decrypt only in the place and for the purpose they were sealed for", () => {
    const sealed = seal("gho_secret", "owner:github:access", "integration-tokens:v1")
    expect(sealed).not.toContain("gho_secret")
    expect(unseal(sealed, "owner:github:access", "integration-tokens:v1")).toBe("gho_secret")
    expect(() => unseal(sealed, "other:github:access", "integration-tokens:v1")).toThrow()
    expect(() => unseal(sealed, "owner:github:access", "env-variables:v1")).toThrow()
  })
})

describeDb("integrations", () => {
  afterAll(resetDatabase)
  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.GITHUB_CLIENT_ID
    delete process.env.GITHUB_CLIENT_SECRET
    if (serverToken !== undefined) process.env.GITHUB_TOKEN = serverToken
  })
  beforeEach(async () => {
    delete process.env.GITHUB_TOKEN
    process.env.GITHUB_CLIENT_ID = "client-id"
    process.env.GITHUB_CLIENT_SECRET = "client-secret"
    await resetDatabase()
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
  })

  test("connecting sends the browser to GitHub with PKCE and stores an encrypted token", async () => {
    const calls = serveGitHub()
    const authorize = await start()
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      "https://github.com/login/oauth/authorize",
    )
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      client_id: "client-id",
      redirect_uri: `${ORIGIN}/api/auth/callback/github/integration`,
      scope: "gist",
      code_challenge_method: "S256",
    })

    const response = await comeBack(`code=the-code&state=${authorize.searchParams.get("state")}`)
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?tab=integrations`)
    expect(request.cookies.has(STATE_COOKIE)).toBe(false)

    const exchange = new URLSearchParams(calls[0]?.body)
    expect(exchange.get("code")).toBe("the-code")
    expect(exchange.get("client_secret")).toBe("client-secret")
    const challenge = new Bun.CryptoHasher("sha256")
      .update(exchange.get("code_verifier") ?? "")
      .digest("base64url")
    expect(challenge).toBe(authorize.searchParams.get("code_challenge") ?? "")

    const stored = await row()
    expect(stored).toMatchObject({ provider: "github", accountId: "583231", scope: "gist" })
    expect(stored?.accessToken).not.toContain("gho_access")
    expect(await accessToken("owner", "github")).toBe("gho_access")
    expect(await listIntegrations("owner")).toEqual([
      {
        id: "github",
        name: "GitHub",
        available: true,
        connection: { account: "octocat", connectedAt: expect.any(Number) },
      },
      // Listed for every server, and unavailable until it has a Slack app.
      { id: "slack", name: "Slack", available: false, connection: null },
    ])
    expect((await listIntegrations("other"))[0]?.connection).toBeNull()
  })

  test("the generic callback route completes a connection too", async () => {
    serveGitHub()
    const authorize = await start()
    const response = await callback(
      new Request(
        `${ORIGIN}/api/integrations/github/callback?code=the-code&state=${authorize.searchParams.get("state")}`,
      ),
      { params: Promise.resolve({ provider: "github" }) },
    )
    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings?tab=integrations`)
    expect(await row()).toBeDefined()
  })

  test("a redirect that doesn't belong to the connection stores nothing", async () => {
    const calls = serveGitHub()
    const failed = `${ORIGIN}/settings?tab=integrations&integration=failed`

    const authorize = await start()
    const state = authorize.searchParams.get("state")
    const cookie = request.cookies.get(STATE_COOKIE) ?? ""

    // A forged state, as in a cross-site request.
    expect((await comeBack("code=the-code&state=forged")).headers.get("location")).toBe(failed)
    // The cookie is spent after one attempt.
    expect((await comeBack(`code=the-code&state=${state}`)).headers.get("location")).toBe(failed)
    // Another account can't finish a connection this one started.
    request.cookies.set(STATE_COOKIE, cookie)
    signInAs("other")
    expect((await comeBack(`code=the-code&state=${state}`)).headers.get("location")).toBe(failed)

    expect(calls).toEqual([])
    expect(await row()).toBeUndefined()
    expect(await row("other")).toBeUndefined()
  })

  test("refusing at the provider, or a refused code, comes back with the reason", async () => {
    serveGitHub({ tokens: { error: "bad_verification_code" } })
    await start()
    expect((await comeBack("error=access_denied&state=x")).headers.get("location")).toBe(
      `${ORIGIN}/settings?tab=integrations&integration=denied`,
    )
    const authorize = await start()
    expect(
      (await comeBack(`code=nope&state=${authorize.searchParams.get("state")}`)).headers.get(
        "location",
      ),
    ).toBe(`${ORIGIN}/settings?tab=integrations&integration=failed`)
    expect(await row()).toBeUndefined()
  })

  test("a signed-out browser and a server without the OAuth app can't connect", async () => {
    signInAs(null)
    expect((await connectIntegration("github")).ok).toBe(false)
    expect((await comeBack("code=x&state=y")).headers.get("location")).toBe(`${ORIGIN}/sign-in`)

    signInAs("owner")
    delete process.env.GITHUB_CLIENT_SECRET
    expect(await connectIntegration("github")).toEqual({
      ok: false,
      error: "That integration isn't set up on this server.",
    })
    expect(await connectIntegration("nope")).toEqual({
      ok: false,
      error: "That integration isn't set up on this server.",
    })
    expect((await listIntegrations("owner"))[0]?.available).toBe(false)
    expect(await listImportable("github")).toEqual({ ok: true, connected: false, available: false })
  })

  test("a connected account lists its gists and reads them with its own token", async () => {
    const calls = serveGitHub()
    expect(await listImportable("github")).toEqual({ ok: true, connected: false, available: true })
    await connect()

    expect(await listImportable("github")).toEqual({
      ok: true,
      connected: true,
      items: [
        {
          id: GIST,
          title: "Deploy notes",
          files: 2,
          public: false,
          updatedAt: "2026-10-01T12:00:00Z",
        },
      ],
      nextPage: null,
    })
    const preview = await previewImport("github", GIST)
    expect(preview.ok && preview.item.title).toBe("Deploy notes")
    for (const call of calls.slice(-2)) expect(call.authorization).toBe("Bearer gho_access")
  })

  test("a token GitHub no longer accepts drops the connection and the read goes on without it", async () => {
    serveGitHub()
    await connect()
    const calls = serveGitHub({ accepts: "gho_newer" })

    const preview = await previewImport("github", GIST)
    expect(preview.ok && preview.item.id).toBe(GIST)
    expect(calls.map((call) => call.authorization)).toEqual(["Bearer gho_access", null])
    expect(await row()).toBeUndefined()

    await saveConnection(
      "owner",
      "github",
      { id: "583231", name: "octocat" },
      { accessToken: "gho_access", refreshToken: null, expiresAt: null, scope: "gist" },
    )
    expect(await listImportable("github")).toEqual({ ok: true, connected: false, available: true })
    expect(await row()).toBeUndefined()
  })

  test("an expired token is renewed with its refresh token, or the connection is dropped", async () => {
    const account = { id: "583231", name: "octocat" }
    const expired = {
      accessToken: "ghu_old",
      refreshToken: "ghr_old",
      expiresAt: new Date(Date.now() - 1000),
      scope: "gist",
    }
    await saveConnection("owner", "github", account, expired)
    const calls = serveGitHub({
      tokens: { access_token: "ghu_new", refresh_token: "ghr_new", expires_in: 28800 },
    })
    expect(await accessToken("owner", "github")).toBe("ghu_new")
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "ghr_old",
    })
    // The renewed token is the stored one, so the next call doesn't renew again.
    expect(await accessToken("owner", "github")).toBe("ghu_new")
    expect(calls).toHaveLength(1)

    await saveConnection("owner", "github", account, expired)
    serveGitHub({ tokens: { error: "bad_refresh_token" } })
    expect(await accessToken("owner", "github")).toBeNull()
    expect(await row()).toBeUndefined()
  })

  test("a token sealed under another secret counts as not connected", async () => {
    serveGitHub()
    await connect()
    process.env.ENV_SECRETS_KEY = "another-secret-that-is-long-enough-to-use"
    try {
      expect(await accessToken("owner", "github")).toBeNull()
    } finally {
      delete process.env.ENV_SECRETS_KEY
    }
    expect(await row()).toBeUndefined()
  })

  test("disconnecting removes the connection and revokes the token at GitHub", async () => {
    serveGitHub()
    await connect()
    const calls = serveGitHub()

    expect(await disconnectIntegration("github")).toEqual({ ok: true })
    expect(await row()).toBeUndefined()
    expect(calls).toEqual([
      {
        url: "https://api.github.com/applications/client-id/token",
        method: "DELETE",
        authorization: `Basic ${btoa("client-id:client-secret")}`,
        body: JSON.stringify({ access_token: "gho_access" }),
      },
    ])
    // Already disconnected, from another tab.
    expect(await disconnectIntegration("github")).toEqual({ ok: true })
  })

  test("deleting the account deletes its connections", async () => {
    serveGitHub()
    await connect()
    await resetDatabase()
    expect(await getDb().select().from(integrationConnection)).toEqual([])
  })
})
