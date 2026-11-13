// The OAuth 2.1 authorization code flow with PKCE against a Sniptide instance. The extension is a
// public client: it registers itself (RFC 7591), sends the reader to the consent screen and trades
// the returned code for an hourly access token and a rotating refresh token. Nothing here touches
// chrome.*, so the flow runs under test with a stub fetch.

export const CLIENT_NAME = "Sniptide for Chrome"
export const SCOPE = "read write"

export interface Endpoints {
  authorization: string
  token: string
  registration: string
  revocation: string | null
}

export interface TokenSet {
  accessToken: string
  refreshToken: string
  // When the access token stops working, in epoch milliseconds.
  expiresAt: number
  scopes: string[]
}

export class OAuthError extends Error {
  constructor(
    message: string,
    public code = "oauth_error",
  ) {
    super(message)
    this.name = "OAuthError"
  }
}

type Fetch = typeof fetch

// The origin of a Sniptide instance from what a reader typed, such as "paste.example.com" or a
// full URL. HTTPS is required anywhere but this machine, as the SDK and the server require.
export function instanceOrigin(value: string): string {
  const text = value.trim()
  if (!text)
    throw new OAuthError("Enter the address of your Sniptide instance.", "invalid_instance")
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    throw new OAuthError("That isn't a valid address.", "invalid_instance")
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.username || url.password)
    throw new OAuthError("Leave the user name and password out of the address.", "invalid_instance")
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    throw new OAuthError("The address must start with https://.", "invalid_instance")
  return url.origin
}

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function randomToken(bytes = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function createPkce() {
  const verifier = randomToken(48)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json()
    if (value && typeof value === "object" && !Array.isArray(value))
      return value as Record<string, unknown>
  } catch {}
  return {}
}

async function send(fetcher: Fetch, url: string, init?: RequestInit) {
  let response: Response
  try {
    response = await fetcher(url, { ...init, redirect: "error", cache: "no-store" })
  } catch {
    throw new OAuthError("Can't reach Sniptide. Check the address and your connection.", "network")
  }
  const body = await readJson(response)
  if (!response.ok) {
    const description = body.error_description
    throw new OAuthError(
      typeof description === "string" ? description : `Sniptide answered ${response.status}.`,
      typeof body.error === "string" ? body.error : "oauth_error",
    )
  }
  return body
}

// Reads the instance's authorization server metadata (RFC 8414). Every endpoint must sit on the
// instance itself, so a tampered document can't send the code or the tokens somewhere else.
export async function discover(fetcher: Fetch, instance: string): Promise<Endpoints> {
  let metadata: Record<string, unknown>
  try {
    metadata = await send(fetcher, `${instance}/.well-known/oauth-authorization-server`)
  } catch (error) {
    if (error instanceof OAuthError && error.code === "network") throw error
    throw new OAuthError("No Sniptide instance answers at that address.", "invalid_instance")
  }
  const endpoint = (name: string) => {
    const value = metadata[name]
    if (typeof value !== "string") return null
    try {
      return new URL(value).origin === instance ? value : null
    } catch {
      return null
    }
  }
  const authorization = endpoint("authorization_endpoint")
  const token = endpoint("token_endpoint")
  const registration = endpoint("registration_endpoint")
  if (metadata.issuer !== instance || !authorization || !token || !registration)
    throw new OAuthError("No Sniptide instance answers at that address.", "invalid_instance")
  return { authorization, token, registration, revocation: endpoint("revocation_endpoint") }
}

export async function registerClient(fetcher: Fetch, endpoints: Endpoints, redirectUri: string) {
  const body = await send(fetcher, endpoints.registration, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  })
  if (typeof body.client_id !== "string")
    throw new OAuthError("Sniptide didn't register the extension. Try again.")
  return body.client_id
}

export function authorizationUrl(
  endpoints: Endpoints,
  request: { clientId: string; redirectUri: string; challenge: string; state: string },
) {
  const url = new URL(endpoints.authorization)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    code_challenge: request.challenge,
    code_challenge_method: "S256",
    scope: SCOPE,
    state: request.state,
  }).toString()
  return url.href
}

// The authorization code from the redirect back to the extension. The state proves the redirect
// answers this sign-in, and `iss` names the instance that sent it (RFC 9207).
export function readCallback(callbackUrl: string, expected: { state: string; instance: string }) {
  const params = new URL(callbackUrl).searchParams
  if (params.get("state") !== expected.state)
    throw new OAuthError("The sign-in answer doesn't match this request. Try again.", "state")
  const issuer = params.get("iss")
  if (issuer !== null && issuer !== expected.instance)
    throw new OAuthError("The sign-in answer came from another server. Try again.", "issuer")
  const error = params.get("error")
  if (error === "access_denied") throw new OAuthError("Access wasn't allowed.", error)
  if (error) throw new OAuthError(params.get("error_description") ?? "Sign-in failed.", error)
  const code = params.get("code")
  if (!code) throw new OAuthError("Sniptide sent no sign-in code. Try again.")
  return code
}

function tokenSet(body: Record<string, unknown>, now: number): TokenSet {
  const { access_token: access, refresh_token: refresh, expires_in: expiresIn, scope } = body
  if (typeof access !== "string" || typeof refresh !== "string")
    throw new OAuthError("Sniptide sent no token. Try again.")
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: now + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
    scopes: typeof scope === "string" ? scope.split(" ").filter(Boolean) : [],
  }
}

function tokenRequest(fetcher: Fetch, endpoints: Endpoints, form: Record<string, string>) {
  return send(fetcher, endpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  })
}

export async function exchangeCode(
  fetcher: Fetch,
  endpoints: Endpoints,
  grant: { clientId: string; redirectUri: string; code: string; verifier: string },
  now = Date.now(),
) {
  return tokenSet(
    await tokenRequest(fetcher, endpoints, {
      grant_type: "authorization_code",
      client_id: grant.clientId,
      redirect_uri: grant.redirectUri,
      code: grant.code,
      code_verifier: grant.verifier,
    }),
    now,
  )
}

// Renews the access token. The refresh token changes on every use, so the caller must store the
// returned set before it makes another request.
export async function refreshTokens(
  fetcher: Fetch,
  endpoints: Endpoints,
  grant: { clientId: string; refreshToken: string },
  now = Date.now(),
) {
  return tokenSet(
    await tokenRequest(fetcher, endpoints, {
      grant_type: "refresh_token",
      client_id: grant.clientId,
      refresh_token: grant.refreshToken,
    }),
    now,
  )
}

// Ends the connection on the server. Failing to reach it must not keep the reader signed in, so
// errors are swallowed and the caller clears its stored tokens either way.
export async function revoke(
  fetcher: Fetch,
  endpoints: Endpoints,
  clientId: string,
  token: string,
) {
  if (!endpoints.revocation) return
  try {
    await fetcher(endpoints.revocation, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, client_id: clientId }).toString(),
    })
  } catch {}
}
