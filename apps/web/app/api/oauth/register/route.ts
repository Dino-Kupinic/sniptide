import { registerClient } from "@/lib/oauth/clients"
import { oauthError, oauthJson, oauthLimit, preflight } from "@/lib/oauth/http"

export const runtime = "nodejs"

// Dynamic client registration (RFC 7591) for public clients.
export async function POST(request: Request) {
  const limit = await oauthLimit(request, "register")
  if (limit?.limited) return limit.limited
  const text = await request.text()
  if (text.length > 16 * 1024)
    return oauthError("invalid_client_metadata", "Use at most 16 KiB of client metadata.", 413)
  let metadata: unknown
  try {
    metadata = JSON.parse(text)
  } catch {
    return oauthError("invalid_client_metadata", "The body isn't valid JSON.")
  }
  const result = await registerClient(metadata)
  if (!result.ok) return oauthError(result.error, result.description)
  const { client } = result
  return oauthJson(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "read write",
    },
    201,
    limit?.headers,
  )
}

export const OPTIONS = preflight
