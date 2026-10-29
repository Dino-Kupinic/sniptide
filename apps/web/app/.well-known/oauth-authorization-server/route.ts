import { cors, preflight } from "@/lib/oauth/http"
import { appOrigin, authorizationServerMetadata } from "@/lib/oauth/metadata"

// RFC 8414 authorization server metadata.
export function GET(request: Request) {
  return Response.json(authorizationServerMetadata(appOrigin(request.url)), {
    headers: { ...cors, "cache-control": "public, max-age=3600" },
  })
}

export const OPTIONS = preflight
