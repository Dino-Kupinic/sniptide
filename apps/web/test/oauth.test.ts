import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import { apiToken, oauthClient, oauthCode } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { GET as asMetadata } from "@/app/.well-known/oauth-authorization-server/route"
import { GET as prMetadata } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route"
import { POST as mcp } from "@/app/api/mcp/route"
import { POST as authorize } from "@/app/api/oauth/authorize/route"
import { POST as register } from "@/app/api/oauth/register/route"
import { POST as revokeRoute } from "@/app/api/oauth/revoke/route"
import { POST as token } from "@/app/api/oauth/token/route"
import { GET as me } from "@/app/api/v1/me/route"
import { POST as createPaste } from "@/app/api/v1/pastes/route"
import { listTokens } from "@/lib/api/tokens"
import { afterSignIn } from "@/lib/auth-redirect"
import { getDb } from "@/lib/db"
import { isAllowedRedirectUri, matchRedirectUri } from "@/lib/oauth/clients"
import { purgeStaleData } from "@/lib/pastes/purge"
import { hasDatabase, resetDatabase, seedUser, signInAs } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const origin = "http://localhost:3000"
const redirectUri = "https://client.example/callback"

test("redirect URIs allow https, loopback http and app schemes, never scripts or fragments", () => {
  for (const uri of [
    "https://claude.ai/api/mcp/auth_callback",
    "http://localhost:33418/callback",
    "http://127.0.0.1/cb",
    "cursor://anysphere.cursor-retrieval/oauth/callback",
  ])
    expect(isAllowedRedirectUri(uri), uri).toBe(true)
  for (const uri of [
    "http://evil.example/cb",
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://client.example/cb#frag",
    "https://user:pass@client.example/cb",
    "not a url",
  ])
    expect(isAllowedRedirectUri(uri), uri).toBe(false)
  const client = { redirectUris: ["http://127.0.0.1:1000/cb", redirectUri] }
  expect(matchRedirectUri(client, "http://127.0.0.1:52011/cb")).toBe("http://127.0.0.1:52011/cb")
  expect(matchRedirectUri(client, "http://127.0.0.1:52011/other")).toBeNull()
  expect(matchRedirectUri(client, `${redirectUri}x`)).toBeNull()
})

test("sign-in only returns to the consent screen", () => {
  expect(afterSignIn("/oauth/authorize?client_id=x")).toBe("/oauth/authorize?client_id=x")
  for (const next of ["//evil.example", "https://evil.example", "/settings", "/oauth/authorizex"])
    expect(afterSignIn(next)).toBe("/dashboard")
})

test("discovery documents link the resource to the authorization server", async () => {
  const as = await asMetadata(
    new Request(`${origin}/.well-known/oauth-authorization-server`),
  ).json()
  expect(as).toMatchObject({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["read", "write"],
  })
  const context = (path?: string[]) => ({ params: Promise.resolve({ path }) })
  const root = await (
    await prMetadata(new Request(`${origin}/.well-known/oauth-protected-resource`), context())
  ).json()
  expect(root).toMatchObject({ resource: origin, authorization_servers: [origin] })
  const forMcp = await (
    await prMetadata(
      new Request(`${origin}/.well-known/oauth-protected-resource/api/mcp`),
      context(["api", "mcp"]),
    )
  ).json()
  expect(forMcp.resource).toBe(`${origin}/api/mcp`)
  const other = await prMetadata(
    new Request(`${origin}/.well-known/oauth-protected-resource/nope`),
    context(["nope"]),
  )
  expect(other.status).toBe(404)
})

describeDb("OAuth for agent clients", () => {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")

  beforeEach(async () => {
    await resetDatabase()
    await getDb().delete(oauthClient)
    await seedUser("owner")
    await seedUser("other")
    signInAs("owner")
  })
  afterAll(async () => {
    await resetDatabase()
    await getDb().delete(oauthClient)
  })

  async function registerClient(
    body: unknown = { client_name: "Claude", redirect_uris: [redirectUri] },
  ) {
    return register(
      new Request(`${origin}/api/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    )
  }

  function authorizeParams(clientId: string, extra: Record<string, string> = {}) {
    return new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "read write",
      state: "xyz",
      resource: `${origin}/api/mcp`,
      ...extra,
    })
  }

  function consent(params: URLSearchParams, decision = "allow", from = origin) {
    return authorize(
      new Request(`${origin}/api/oauth/authorize`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: from },
        body: `${params}&decision=${decision}`,
      }),
    )
  }

  function tokenRequest(fields: Record<string, string>) {
    return token(
      new Request(`${origin}/api/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
      }),
    )
  }

  async function codeFor(clientId: string) {
    const response = await consent(authorizeParams(clientId))
    expect(response.status).toBe(303)
    const location = new URL(response.headers.get("location") ?? "")
    expect(location.origin + location.pathname).toBe(redirectUri)
    expect(location.searchParams.get("state")).toBe("xyz")
    expect(location.searchParams.get("iss")).toBe(origin)
    return location.searchParams.get("code") ?? ""
  }

  const exchange = (clientId: string, code: string, codeVerifier = verifier) =>
    tokenRequest({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })

  const bearer = (path: string, value: string) =>
    new Request(`${origin}${path}`, { headers: { authorization: `Bearer ${value}` } })

  test("registration rejects unsafe metadata and returns a public client", async () => {
    const bad = await registerClient({ redirect_uris: ["http://evil.example/cb"] })
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe("invalid_redirect_uri")
    const secret = await registerClient({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "client_secret_basic",
    })
    expect((await secret.json()).error).toBe("invalid_client_metadata")
    const response = await registerClient({
      client_name: "Claude\u0007 Code",
      redirect_uris: [redirectUri],
    })
    expect(response.status).toBe(201)
    const client = await response.json()
    expect(client.client_id).toStartWith("sntc_")
    expect(client.client_name).toBe("Claude Code")
    expect(client.token_endpoint_auth_method).toBe("none")
  })

  test("the full flow issues a scoped token that works, refreshes, rotates and revokes", async () => {
    const { client_id: clientId } = await (await registerClient()).json()
    const code = await codeFor(clientId)
    const issued = await exchange(clientId, code)
    expect(issued.status).toBe(200)
    const tokens = await issued.json()
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "read write" })

    const meResponse = await me(bearer("/api/v1/me", tokens.access_token))
    expect(meResponse.status).toBe(200)
    expect((await meResponse.json()).user.id).toBe("owner")
    const [listed] = await listTokens("owner")
    expect(listed).toMatchObject({ name: "Claude", connectedApp: true, scopes: ["read", "write"] })

    // The code works once.
    expect((await (await exchange(clientId, code)).json()).error).toBe("invalid_grant")

    const refreshed = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      scope: "read",
    })
    expect(refreshed.status).toBe(200)
    const next = await refreshed.json()
    expect(next.scope).toBe("read")
    expect((await me(bearer("/api/v1/me", tokens.access_token))).status).toBe(401)
    expect((await me(bearer("/api/v1/me", next.access_token))).status).toBe(200)
    const reused = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    })
    expect((await reused.json()).error).toBe("invalid_grant")
    const widened = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: next.refresh_token,
      client_id: clientId,
      scope: "read write",
    })
    expect((await widened.json()).error).toBe("invalid_grant")

    // A read-only grant can't write, and the 403 says which scope is missing.
    const write = await createPaste(
      new Request(`${origin}/api/v1/pastes`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${next.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "x", files: [{ name: "a.ts", content: "1" }] }),
      }),
    )
    expect(write.status).toBe(403)
    expect(write.headers.get("www-authenticate")).toContain('error="insufficient_scope"')
    expect(write.headers.get("www-authenticate")).toContain('scope="write"')

    const revoked = await revokeRoute(
      new Request(`${origin}/api/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: next.refresh_token }).toString(),
      }),
    )
    expect(revoked.status).toBe(200)
    expect((await me(bearer("/api/v1/me", next.access_token))).status).toBe(401)
    expect(await listTokens("owner")).toEqual([])
  })

  test("a wrong verifier, client or redirect URI gets no token, and the code is spent", async () => {
    const { client_id: clientId } = await (await registerClient()).json()
    const { client_id: otherClient } = await (await registerClient()).json()
    const code = await codeFor(clientId)
    expect((await (await exchange(otherClient, code)).json()).error).toBe("invalid_grant")
    const second = await codeFor(clientId)
    const wrong = await exchange(clientId, second, randomBytes(32).toString("base64url"))
    expect((await wrong.json()).error).toBe("invalid_grant")
    expect((await (await exchange(clientId, second)).json()).error).toBe("invalid_grant")
    const third = await codeFor(clientId)
    const mismatched = await tokenRequest({
      grant_type: "authorization_code",
      code: third,
      client_id: clientId,
      redirect_uri: `${redirectUri}/other`,
      code_verifier: verifier,
    })
    expect((await mismatched.json()).error).toBe("invalid_grant")
    expect(await getDb().select().from(apiToken)).toEqual([])
  })

  test("consent needs this app's origin, a session and a valid request", async () => {
    const { client_id: clientId } = await (await registerClient()).json()
    expect((await consent(authorizeParams(clientId), "allow", "https://evil.example")).status).toBe(
      403,
    )
    // The consent page's script asks for JSON, since the CSP blocks a form from following the
    // redirect to the client.
    const scripted = await authorize(
      new Request(`${origin}/api/oauth/authorize`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          origin,
        },
        body: `${authorizeParams(clientId)}&decision=allow`,
      }),
    )
    expect((await scripted.json()).redirect).toStartWith(`${redirectUri}?code=`)
    const denied = await consent(authorizeParams(clientId), "deny")
    expect(new URL(denied.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "access_denied",
    )
    const noPkce = await consent(authorizeParams(clientId, { code_challenge_method: "plain" }))
    expect(new URL(noPkce.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "invalid_request",
    )
    const elsewhere = await consent(
      authorizeParams(clientId, { resource: "https://evil.example/api" }),
    )
    expect(new URL(elsewhere.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "invalid_target",
    )
    // An unregistered redirect URI is never redirected to.
    const forged = await consent(
      authorizeParams(clientId, { redirect_uri: "https://evil.example/cb" }),
    )
    expect(forged.headers.get("location")).toStartWith(`${origin}/oauth/authorize?`)
    signInAs(null)
    const signedOut = await consent(authorizeParams(clientId))
    expect(signedOut.headers.get("location")).toStartWith(`${origin}/sign-in?next=`)
    expect((await getDb().select().from(oauthCode)).length).toBe(1)
  })

  test("grants stay with the account that approved them", async () => {
    const { client_id: clientId } = await (await registerClient()).json()
    const tokens = await (await exchange(clientId, await codeFor(clientId))).json()
    expect(await listTokens("other")).toEqual([])
    const body = await (await me(bearer("/api/v1/me", tokens.access_token))).json()
    expect(JSON.stringify(body)).not.toContain("other")
  })

  test("401s point at the protected resource metadata", async () => {
    const api = await me(new Request(`${origin}/api/v1/me`))
    expect(api.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    )
    const server = await mcp(
      new Request(`${origin}/api/mcp`, {
        method: "POST",
        headers: { authorization: "Bearer snpt_not-a-real-token-at-all" },
      }),
    )
    expect(server.status).toBe(401)
    expect(server.headers.get("www-authenticate")).toBe(
      `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
    )
  })

  test("the purge removes spent codes, lapsed grants and abandoned clients", async () => {
    const { client_id: kept } = await (await registerClient()).json()
    await exchange(kept, await codeFor(kept))
    const { client_id: abandoned } = await (await registerClient()).json()
    await codeFor(kept)
    await getDb()
      .update(oauthCode)
      .set({ expiresAt: new Date(Date.now() - 1000) })
    await getDb()
      .update(oauthClient)
      .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
    await purgeStaleData()
    expect(await getDb().select().from(oauthCode)).toEqual([])
    const clients = (await getDb().select().from(oauthClient)).map((row) => row.id)
    expect(clients).toEqual([kept])
    expect(clients).not.toContain(abandoned)
    await getDb()
      .update(apiToken)
      .set({ refreshExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiToken.clientId, kept))
    await purgeStaleData()
    expect(await getDb().select().from(apiToken)).toEqual([])
  })
})
