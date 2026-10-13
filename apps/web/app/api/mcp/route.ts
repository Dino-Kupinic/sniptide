import { handleMcpRequest } from "@sniptide/mcp/http"
import { failure, withToken } from "@/lib/api/http"
import { mcpBackend } from "@/lib/api/mcp"

export const runtime = "nodejs"

export async function POST(request: Request) {
  // Native agent clients omit Origin. Browser requests may only come from this instance;
  // cookies are never accepted as MCP credentials.
  const origin = request.headers.get("origin")
  const expectedOrigin = process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).origin
    : new URL(request.url).origin
  if (origin && origin !== expectedOrigin) return failure(403, "This origin isn't allowed.")
  return withToken(request, "read", (owner) => handleMcpRequest(request, mcpBackend(owner)))
}

// Stateless JSON responses: no standalone SSE stream or session to delete.
export async function GET(request: Request) {
  return withToken(
    request,
    "read",
    async () =>
      new Response(null, {
        status: 405,
        headers: { allow: "POST", "cache-control": "private, no-store" },
      }),
  )
}

export async function DELETE(request: Request) {
  return GET(request)
}
