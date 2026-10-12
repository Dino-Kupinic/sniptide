import { getSession } from "@/lib/auth"
import { parseRange } from "@/lib/pastes/analytics"
import { getAnalyticsReport } from "@/lib/pastes/analytics-report"

export const dynamic = "force-dynamic"

// The Analytics page's figures as JSON: /api/stats?range=30d, narrowed with &paste=<slug> or
// &collection=<slug>. Views, unique visitors, code copies and raw hits as totals with the change
// against the period before, as a series per day (per hour for 24h), and the top pastes,
// referrers, countries, devices and languages. `range` is one of 24h, 7d, 30d and 90d; anything
// else means 30d. Only the signed-in viewer's own pastes are counted.
export async function GET(request: Request) {
  const headers = { "cache-control": "private, no-store" }
  if (!(await getSession())) {
    return Response.json(
      { ok: false, error: "Sign in to see analytics." },
      { status: 401, headers },
    )
  }

  const params = new URL(request.url).searchParams
  const report = await getAnalyticsReport({
    range: parseRange(params.get("range") ?? undefined),
    paste: params.get("paste") ?? undefined,
    collection: params.get("collection") ?? undefined,
  })
  return Response.json(report, { headers })
}
