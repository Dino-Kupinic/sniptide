import { revoke } from "@/lib/oauth/grants"
import { oauthError, oauthJson, oauthLimit, preflight, readForm } from "@/lib/oauth/http"

export const runtime = "nodejs"

// Token revocation (RFC 7009). Revoking either token of a grant ends the whole grant, and an
// unknown token gets the same 200, so the endpoint can't confirm which tokens exist.
export async function POST(request: Request) {
  const limit = await oauthLimit(request, "token")
  if (limit?.limited) return limit.limited
  const form = await readForm(request)
  if (!form) return oauthError("invalid_request", "Send an application/x-www-form-urlencoded body.")
  await revoke(form.get("token") ?? "")
  return oauthJson({}, 200, limit?.headers)
}

export const OPTIONS = preflight
