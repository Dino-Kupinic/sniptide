import { isAnalyticsHost, uiHost } from "@/lib/analytics-proxy"
import { getConfig } from "@/lib/config"
import { countryOf } from "@/lib/pastes/hit"

// Whether analytics are on, for components/analytics.tsx. 204 when POSTHOG_KEY is unset or the
// request comes from a preview or local host: an error status would put a failed request in every
// visitor's console on a self-hosted instance. Preview deployments never receive the key, so they
// cannot send even if the SDK loads.
//
// `country` is the visitor's country as the CDN in front reports it, or null. PostHog strips the
// IP from cookieless events before its GeoIP lookup runs, so the browser adds this country to
// those events itself (withCountry in lib/analytics.ts). The answer differs per visitor, so only
// the browser may cache it.
export function GET(request: Request) {
  const analytics = getConfig().analytics
  const hostname = new URL(request.url).hostname
  if (!analytics || !isAnalyticsHost(hostname)) return new Response(null, { status: 204 })
  return Response.json(
    { key: analytics.key, uiHost: uiHost(analytics.host), country: countryOf(request.headers) },
    { headers: { "cache-control": "private, max-age=300" } },
  )
}
