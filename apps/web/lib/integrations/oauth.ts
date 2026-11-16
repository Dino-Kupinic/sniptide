import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { seal, unseal } from "@/lib/sealed"
import type { IntegrationProvider, OAuthCredentials } from "./types"

// The OAuth 2 authorization code flow, with PKCE where the provider allows it, that connects an external account. What must
// survive the trip to the provider and back (the state, the PKCE verifier and who started it)
// travels in an encrypted, HttpOnly cookie, so nothing is stored until the connection exists.

export const STATE_COOKIE = "sniptide_integration"
export const STATE_SECONDS = 10 * 60
const PURPOSE = "integration-oauth-state:v1"

export interface Tokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scope: string
}

const pendingSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  userId: z.string(),
  provider: z.string(),
  expires: z.number(),
})

function callbackUrl(provider: IntegrationProvider, origin: string) {
  return `${origin}${provider.oauth.callbackPath ?? `/api/integrations/${provider.id}/callback`}`
}

// Where to send the user, and the cookie that `finishAuthorization` checks the way back against.
export function startAuthorization(
  provider: IntegrationProvider,
  credentials: OAuthCredentials,
  userId: string,
  origin: string,
) {
  const state = randomBytes(24).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const url = new URL(provider.oauth.authorizeUrl)
  const pkce = provider.oauth.pkce !== false
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: credentials.clientId,
    redirect_uri: callbackUrl(provider, origin),
    scope: provider.oauth.scopes.join(provider.oauth.scopeSeparator ?? " "),
    state,
    ...(pkce
      ? {
          code_challenge: createHash("sha256").update(verifier).digest("base64url"),
          code_challenge_method: "S256",
        }
      : {}),
  }).toString()
  const pending: z.infer<typeof pendingSchema> = {
    state,
    verifier,
    userId,
    provider: provider.id,
    expires: Date.now() + STATE_SECONDS * 1000,
  }
  return { url: url.toString(), cookie: seal(JSON.stringify(pending), STATE_COOKIE, PURPOSE) }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
  scope: z.string().optional(),
})

async function requestTokens(
  provider: IntegrationProvider,
  credentials: OAuthCredentials,
  grant: Record<string, string>,
): Promise<Tokens | null> {
  const response = await fetch(provider.oauth.tokenUrl, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      ...grant,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!response?.ok) return null
  // Providers such as GitHub answer 200 with an `error` field, which fails the schema.
  const tokens = tokenSchema.safeParse(await response.json().catch(() => null))
  if (!tokens.success) return null
  return {
    accessToken: tokens.data.access_token,
    refreshToken: tokens.data.refresh_token ?? null,
    expiresAt: tokens.data.expires_in ? new Date(Date.now() + tokens.data.expires_in * 1000) : null,
    scope: tokens.data.scope ?? provider.oauth.scopes.join(" "),
  }
}

function sameText(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Trades the provider's `code` for tokens. Null when the redirect doesn't belong to a connection
// this user started for this provider in the last ten minutes, or the provider refuses the code.
export async function finishAuthorization(
  provider: IntegrationProvider,
  credentials: OAuthCredentials,
  userId: string,
  origin: string,
  params: URLSearchParams,
  cookie: string | undefined,
): Promise<Tokens | null> {
  const code = params.get("code")
  const state = params.get("state")
  if (!code || !state || !cookie) return null

  let pending: z.infer<typeof pendingSchema>
  try {
    pending = pendingSchema.parse(JSON.parse(unseal(cookie, STATE_COOKIE, PURPOSE)))
  } catch {
    return null
  }
  if (
    pending.expires < Date.now() ||
    pending.userId !== userId ||
    pending.provider !== provider.id ||
    !sameText(pending.state, state)
  )
    return null

  return requestTokens(provider, credentials, {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(provider, origin),
    ...(provider.oauth.pkce !== false ? { code_verifier: pending.verifier } : {}),
  })
}

export function refreshTokens(
  provider: IntegrationProvider,
  credentials: OAuthCredentials,
  refreshToken: string,
) {
  return requestTokens(provider, credentials, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
}
