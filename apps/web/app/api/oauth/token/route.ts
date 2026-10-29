import { exchangeCode, GrantError, refresh } from "@/lib/oauth/grants"
import { oauthError, oauthJson, oauthLimit, preflight, readForm } from "@/lib/oauth/http"

export const runtime = "nodejs"

// The token endpoint: authorization_code with PKCE, and refresh_token.
export async function POST(request: Request) {
  const limit = await oauthLimit(request, "token")
  if (limit?.limited) return limit.limited
  const form = await readForm(request)
  if (!form) return oauthError("invalid_request", "Send an application/x-www-form-urlencoded body.")
  if (form.get("client_secret"))
    return oauthError("invalid_client", "Clients are public. Don't send a client_secret.", 401)
  try {
    const grantType = form.get("grant_type")
    if (grantType === "authorization_code")
      return oauthJson(await exchangeCode(form), 200, limit?.headers)
    if (grantType === "refresh_token") return oauthJson(await refresh(form), 200, limit?.headers)
    return oauthError(
      "unsupported_grant_type",
      "Use grant_type authorization_code or refresh_token.",
    )
  } catch (error) {
    if (error instanceof GrantError)
      return oauthError(error.code, error.message, error.code === "invalid_client" ? 401 : 400)
    console.error(JSON.stringify({ event: "oauth_token_error" }))
    return oauthError("server_error", "An unexpected error occurred.", 500)
  }
}

export const OPTIONS = preflight
