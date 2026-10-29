import "server-only"

import { clientAddress } from "@/lib/client-ip"
import { hit, quotaHeaders } from "@/lib/rate-limit"
import { seconds } from "@/lib/time"

// Shared by the OAuth endpoints. They take no cookies, so any origin may call them, which browser
// based MCP clients need. Errors use the OAuth shape (RFC 6749 5.2): { error, error_description }.

export const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-expose-headers": "www-authenticate, ratelimit, ratelimit-policy, retry-after",
}

export function preflight() {
  return new Response(null, {
    status: 204,
    headers: { ...cors, "access-control-max-age": "86400" },
  })
}

export function oauthJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { ...cors, "cache-control": "no-store", pragma: "no-cache", ...headers },
  })
}

export function oauthError(error: string, description: string, status = 400) {
  return oauthJson({ error, error_description: description }, status)
}

const LIMITS = {
  register: { max: 20, window: seconds(60 * 60) },
  token: { max: 60, window: seconds(60) },
} as const

// Per-address limits on registration and the token endpoint. Like the other public limits, an
// address that can't be resolved is let through instead of pooling every visitor.
export async function oauthLimit(request: Request, endpoint: keyof typeof LIMITS) {
  const address = clientAddress(request.headers)
  if (address === "unknown") return null
  const { max, window } = LIMITS[endpoint]
  const result = await hit([
    {
      policy: `oauth-${endpoint}`,
      key: `oauth:${endpoint}:${address}`,
      max,
      windowSeconds: window,
    },
  ])
  const headers = Object.fromEntries(
    Object.entries(quotaHeaders(result.quotas)).filter(([, value]) => value),
  )
  if (result.allowed) return { limited: null, headers }
  return {
    limited: oauthJson(
      { error: "slow_down", error_description: "Too many requests. Wait and try again." },
      429,
      { ...headers, "retry-after": String(result.retryAfterSeconds) },
    ),
    headers,
  }
}

// Reads an application/x-www-form-urlencoded body of at most 8 KiB, or null.
export async function readForm(request: Request) {
  const type = request.headers.get("content-type") ?? ""
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) return null
  const text = await request.text()
  if (text.length > 8192) return null
  return new URLSearchParams(text)
}
