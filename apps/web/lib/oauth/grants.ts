import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { apiToken, oauthCode } from "@workspace/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { SCOPES, type Scope } from "@/lib/api/scopes"
import { hashToken, MAX_TOKENS, TOKEN_PREFIX } from "@/lib/api/tokens"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"
import { getClient, matchRedirectUri, type OAuthClient } from "./clients"
import { ACCESS_TOKEN_SECONDS, appOrigin, CODE_SECONDS, REFRESH_TOKEN_DAYS } from "./metadata"

// The authorization code flow with PKCE (OAuth 2.1). A code lives ten minutes and works once. The
// token it buys is a personal API token row, so the API, MCP, scopes, rate limits and revocation
// in Settings treat it like any other; it lasts an hour and the client renews it with a refresh
// token, which rotates on every use and lapses after 30 days without one.

const REFRESH_PREFIX = "snptr_"

export interface AuthorizationRequest {
  client: OAuthClient
  redirectUri: string
  state: string | null
  codeChallenge: string
  scopes: Scope[]
  resource: string | null
}

export type AuthorizationCheck =
  | { ok: true; request: AuthorizationRequest }
  // The client or redirect URI can't be trusted, so the error is shown here instead of sent back.
  | { ok: false; redirect: null; error: "invalid_client" | "invalid_redirect_uri" }
  // Everything else goes back to the client's redirect URI (RFC 6749 4.1.2.1).
  | { ok: false; redirect: string; error: string }

// Read, write or both. Write always comes with read, as on tokens made in Settings. No scope
// asks for read.
export function parseScopes(value: string | null): Scope[] | null {
  const requested = (value ?? "").split(" ").filter(Boolean)
  if (requested.some((scope) => !SCOPES.includes(scope as Scope))) return null
  return requested.includes("write") ? ["read", "write"] : ["read"]
}

// A resource indicator (RFC 8707) must name this app: its origin or a path on it, like /api/mcp.
export function checkResource(value: string | null, origin: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.origin === origin && !url.hash
  } catch {
    return false
  }
}

export function errorRedirect(
  redirectUri: string,
  issuer: string,
  error: string,
  state: string | null,
  description?: string,
) {
  const url = new URL(redirectUri)
  url.searchParams.set("error", error)
  if (description) url.searchParams.set("error_description", description)
  if (state !== null) url.searchParams.set("state", state)
  url.searchParams.set("iss", issuer)
  return url.href
}

// Checks an authorization request's parameters, from the consent page or its form.
export async function checkAuthorization(
  params: URLSearchParams,
  requestUrl: string,
): Promise<AuthorizationCheck> {
  const issuer = appOrigin(requestUrl)
  const client = await getClient(params.get("client_id") ?? "")
  if (!client) return { ok: false, redirect: null, error: "invalid_client" }
  const redirectUri = matchRedirectUri(client, params.get("redirect_uri") ?? "")
  if (!redirectUri) return { ok: false, redirect: null, error: "invalid_redirect_uri" }

  const state = params.get("state")
  const fail = (error: string, description: string) => ({
    ok: false as const,
    redirect: errorRedirect(redirectUri, issuer, error, state, description),
    error,
  })
  if (params.get("response_type") !== "code")
    return fail("unsupported_response_type", "Use response_type=code.")
  const codeChallenge = params.get("code_challenge") ?? ""
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge))
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.")
  const scopes = parseScopes(params.get("scope"))
  if (!scopes) return fail("invalid_scope", "Supported scopes are read and write.")
  const resource = params.get("resource")
  if (!checkResource(resource, issuer))
    return fail("invalid_target", `The resource must be on ${issuer}.`)
  return { ok: true, request: { client, redirectUri, state, codeChallenge, scopes, resource } }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

// The approved request's redirect, carrying a fresh one-time code.
export async function approve(request: AuthorizationRequest, userId: string, issuer: string) {
  const code = randomBytes(32).toString("base64url")
  await getDb()
    .insert(oauthCode)
    .values({
      hash: sha256(code),
      clientId: request.client.id,
      userId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      scopes: request.scopes,
      resource: request.resource,
      expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
    })
  const url = new URL(request.redirectUri)
  url.searchParams.set("code", code)
  if (request.state !== null) url.searchParams.set("state", request.state)
  url.searchParams.set("iss", issuer)
  return url.href
}

export class GrantError extends Error {
  constructor(
    public code: "invalid_request" | "invalid_grant" | "invalid_client" | "invalid_target",
    message: string,
  ) {
    super(message)
  }
}

export interface TokenResponse {
  access_token: string
  token_type: "Bearer"
  expires_in: number
  refresh_token: string
  scope: string
}

function newCredentials(scopes: Scope[]) {
  const access = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  const refresh = `${REFRESH_PREFIX}${randomBytes(32).toString("base64url")}`
  const now = Date.now()
  return {
    access,
    refresh,
    row: {
      prefix: access.slice(0, TOKEN_PREFIX.length + 6),
      hash: hashToken(access),
      refreshHash: hashToken(refresh),
      expiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_DAYS * DAY),
    },
    response: {
      access_token: access,
      token_type: "Bearer" as const,
      expires_in: ACCESS_TOKEN_SECONDS,
      refresh_token: refresh,
      scope: scopes.join(" "),
    },
  }
}

function verifierMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const actual = Buffer.from(createHash("sha256").update(verifier).digest("base64url"))
  const expected = Buffer.from(challenge)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// grant_type=authorization_code. The code is deleted by the statement that reads it, before any
// check, so it works once even when two exchanges race or the first one fails.
export async function exchangeCode(form: URLSearchParams): Promise<TokenResponse> {
  const code = form.get("code") ?? ""
  const clientId = form.get("client_id") ?? ""
  const verifier = form.get("code_verifier") ?? ""
  if (!code || !clientId || !verifier)
    throw new GrantError("invalid_request", "Send code, client_id, code_verifier and redirect_uri.")
  const [grant] = await getDb()
    .delete(oauthCode)
    .where(eq(oauthCode.hash, sha256(code)))
    .returning()
  if (!grant || grant.expiresAt.getTime() <= Date.now())
    throw new GrantError("invalid_grant", "The code is invalid, expired or already used.")
  if (grant.clientId !== clientId)
    throw new GrantError("invalid_grant", "The code was issued to another client.")
  if (form.get("redirect_uri") !== grant.redirectUri)
    throw new GrantError("invalid_grant", "redirect_uri doesn't match the authorization request.")
  if (!verifierMatches(verifier, grant.codeChallenge))
    throw new GrantError("invalid_grant", "code_verifier doesn't match the code_challenge.")
  const resource = form.get("resource")
  if (resource && grant.resource && resource !== grant.resource)
    throw new GrantError("invalid_target", "resource doesn't match the authorization request.")
  const client = await getClient(clientId)
  if (!client) throw new GrantError("invalid_client", "The client is no longer registered.")

  const scopes = grant.scopes.filter((scope): scope is Scope => SCOPES.includes(scope as Scope))
  const credentials = newCredentials(scopes)
  return getDb().transaction(async (tx) => {
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(apiToken)
      .where(eq(apiToken.ownerId, grant.userId))
    if ((count?.count ?? 0) >= MAX_TOKENS)
      throw new GrantError(
        "invalid_grant",
        `The account has ${MAX_TOKENS} tokens. Revoke one in Settings, API tokens, and authorize again.`,
      )
    await tx.insert(apiToken).values({
      ownerId: grant.userId,
      name: client.name,
      scopes,
      clientId: client.id,
      ...credentials.row,
    })
    return credentials.response
  })
}

// grant_type=refresh_token. The row keeps its id, name and scopes and gets a new access token and
// refresh token, so the old pair stops working the moment the new one is issued.
export async function refresh(form: URLSearchParams): Promise<TokenResponse> {
  const token = form.get("refresh_token") ?? ""
  const clientId = form.get("client_id") ?? ""
  if (!token.startsWith(REFRESH_PREFIX) || !clientId)
    throw new GrantError("invalid_request", "Send refresh_token and client_id.")
  const [row] = await getDb()
    .select()
    .from(apiToken)
    .where(eq(apiToken.refreshHash, hashToken(token)))
  if (
    !row?.refreshExpiresAt ||
    row.refreshExpiresAt.getTime() <= Date.now() ||
    row.clientId !== clientId
  )
    throw new GrantError("invalid_grant", "The refresh token is invalid, expired or revoked.")
  const granted = row.scopes.filter((scope): scope is Scope => SCOPES.includes(scope as Scope))
  // A client may ask for less than it was granted (RFC 6749 6), never for more.
  const requested = form.get("scope") ? parseScopes(form.get("scope")) : granted
  if (!requested || requested.some((scope) => !granted.includes(scope)))
    throw new GrantError("invalid_grant", "A refresh can't add scopes. Authorize again.")
  const credentials = newCredentials(requested)
  const updated = await getDb()
    .update(apiToken)
    .set({ ...credentials.row, scopes: requested })
    .where(and(eq(apiToken.id, row.id), eq(apiToken.refreshHash, hashToken(token))))
    .returning({ id: apiToken.id })
  if (!updated.length) throw new GrantError("invalid_grant", "The refresh token was already used.")
  return credentials.response
}

// Revokes the grant behind an access or refresh token (RFC 7009). Unknown tokens are no error.
export async function revoke(token: string) {
  if (!token) return
  const hash = hashToken(token)
  const column = token.startsWith(REFRESH_PREFIX) ? apiToken.refreshHash : apiToken.hash
  await getDb()
    .delete(apiToken)
    .where(and(eq(column, hash), sql`${apiToken.clientId} is not null`))
}
