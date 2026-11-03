import { cors, preflight } from "@/lib/oauth/http"
import { appOrigin, protectedResourceMetadata } from "@/lib/oauth/metadata"

// RFC 9728 protected resource metadata: /.well-known/oauth-protected-resource for the API and
// /.well-known/oauth-protected-resource/api/mcp for the MCP endpoint. Other paths aren't resources.
export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path?.join("/") ?? ""
  if (path && path !== "api/mcp")
    return Response.json({ error: "not_found" }, { status: 404, headers: cors })
  return Response.json(protectedResourceMetadata(appOrigin(request.url), path ? `/${path}` : ""), {
    headers: { ...cors, "cache-control": "public, max-age=3600" },
  })
}

export const OPTIONS = preflight
