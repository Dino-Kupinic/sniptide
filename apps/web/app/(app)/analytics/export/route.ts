import { getSession } from "@/lib/auth"
import { getAnalyticsReport, parseRange } from "@/lib/pastes/analytics"
import { analyticsCsv, analyticsCsvName } from "@/lib/pastes/analytics-csv"

// The Analytics page's Export CSV: /analytics/export?range=30d&paste=<slug>.
export async function GET(request: Request) {
  if (!(await getSession())) return new Response("Unauthorized", { status: 401 })

  const url = new URL(request.url)
  const report = await getAnalyticsReport({
    range: parseRange(url.searchParams.get("range") ?? undefined),
    paste: url.searchParams.get("paste") ?? undefined,
  })

  return new Response(analyticsCsv(report), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${analyticsCsvName(report)}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}
