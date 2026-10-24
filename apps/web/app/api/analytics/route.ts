import { uiHost } from "@/lib/analytics-proxy"
import { getConfig } from "@/lib/config"

// Whether analytics are on, for components/analytics.tsx. 204 when POSTHOG_KEY is unset: an error
// status would put a failed request in every visitor's console on a self-hosted instance.
export function GET() {
  const analytics = getConfig().analytics
  if (!analytics) return new Response(null, { status: 204 })
  return Response.json(
    { key: analytics.key, uiHost: uiHost(analytics.host) },
    { headers: { "cache-control": "public, max-age=300" } },
  )
}
