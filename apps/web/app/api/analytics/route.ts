import { uiHost } from "@/lib/analytics-proxy"
import { getConfig } from "@/lib/config"

// Whether analytics are on, for components/analytics.tsx. 404 when POSTHOG_KEY is unset.
export function GET() {
  const analytics = getConfig().analytics
  if (!analytics) return new Response(null, { status: 404 })
  return Response.json(
    { key: analytics.key, uiHost: uiHost(analytics.host) },
    { headers: { "cache-control": "public, max-age=300" } },
  )
}
