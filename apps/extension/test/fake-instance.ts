// A stand-in for a Sniptide instance's OAuth and token API, answering through `fetch`. It keeps
// the server's rules that matter to the extension: codes need the PKCE verifier, a refresh token
// works once, and a revoked or lapsed access token gets a 401.

export const INSTANCE = "https://sniptide.test"
export const REDIRECT = "https://abcdefghijklmnop.chromiumapp.org/oauth"

async function challengeOf(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export function fakeInstance() {
  const state = {
    requests: [] as string[],
    clients: new Set<string>(),
    codes: new Map<string, { clientId: string; challenge: string }>(),
    access: new Set<string>(),
    refresh: new Map<string, string>(),
    revoked: [] as string[],
    scope: "read write",
    pastes: 0,
    metadata: {
      issuer: INSTANCE,
      authorization_endpoint: `${INSTANCE}/oauth/authorize`,
      token_endpoint: `${INSTANCE}/api/oauth/token`,
      registration_endpoint: `${INSTANCE}/api/oauth/register`,
      revocation_endpoint: `${INSTANCE}/api/oauth/revoke`,
    } as Record<string, string>,
    counter: 0,
  }
  const json = (body: unknown, status = 200) => Response.json(body, { status })
  const issue = (clientId: string) => {
    const access = `snpt_access${++state.counter}`.padEnd(24, "x")
    const refresh = `snptr_refresh${state.counter}`
    state.access.add(access)
    state.refresh.set(refresh, clientId)
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refresh,
      scope: state.scope,
    }
  }

  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    state.requests.push(`${method} ${url.pathname}`)
    const form = new URLSearchParams(typeof init?.body === "string" ? init.body : "")

    if (url.pathname === "/.well-known/oauth-authorization-server") return json(state.metadata)
    if (url.pathname === "/api/oauth/register") {
      const id = `sntc_${++state.counter}`
      state.clients.add(id)
      return json({ client_id: id }, 201)
    }
    if (url.pathname === "/api/oauth/token") {
      const clientId = form.get("client_id") ?? ""
      if (form.get("grant_type") === "authorization_code") {
        const grant = state.codes.get(form.get("code") ?? "")
        state.codes.delete(form.get("code") ?? "")
        const verified =
          grant?.clientId === clientId &&
          grant.challenge === (await challengeOf(form.get("code_verifier") ?? "")) &&
          form.get("redirect_uri") === REDIRECT
        if (!verified) return json({ error: "invalid_grant", error_description: "Bad code." }, 400)
        return json(issue(clientId))
      }
      const token = form.get("refresh_token") ?? ""
      if (state.refresh.get(token) !== clientId)
        return json({ error: "invalid_grant", error_description: "Bad refresh token." }, 400)
      state.refresh.delete(token)
      return json(issue(clientId))
    }
    if (url.pathname === "/api/oauth/revoke") {
      state.revoked.push(form.get("token") ?? "")
      return json({})
    }

    const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? ""
    if (!state.access.has(token))
      return json({ ok: false, code: "unauthorized", message: "The API token is invalid." }, 401)
    if (url.pathname === "/api/v1/me")
      return json({
        user: { id: "u1", name: "Ada Lovelace", username: "ada" },
        scopes: state.scope.split(" "),
      })
    if (url.pathname === "/api/v1/pastes" && method === "POST") {
      state.pastes++
      return json({ paste: { id: `p${state.pastes}`, url: `${INSTANCE}/p${state.pastes}` } }, 201)
    }
    return json({ ok: false, code: "not_found", message: "No such route." }, 404)
  }) as typeof fetch

  // What the browser does with the consent screen: the reader allows access and Sniptide
  // redirects back with a code.
  const authorize = async (authorizationUrl: string) => {
    const params = new URL(authorizationUrl).searchParams
    const code = `code${++state.counter}`
    state.codes.set(code, {
      clientId: params.get("client_id") ?? "",
      challenge: params.get("code_challenge") ?? "",
    })
    const callback = new URL(params.get("redirect_uri") ?? "")
    callback.searchParams.set("code", code)
    callback.searchParams.set("state", params.get("state") ?? "")
    callback.searchParams.set("iss", INSTANCE)
    return callback.href
  }

  return { state, fetch: fetcher, authorize }
}
