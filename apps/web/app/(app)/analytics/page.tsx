import { AnalyticsBreadcrumb } from "@/components/analytics-page/breadcrumb"
import { AnalyticsControls } from "@/components/analytics-page/controls"
import { Overview } from "@/components/analytics-page/overview"
import {
  Countries,
  Devices,
  Languages,
  Referrers,
  TopPastes,
} from "@/components/analytics-page/panels"
import { PageHeader } from "@/components/page-header"
import { requireSession } from "@/lib/auth"
import { getAnalyticsReport, parseRange } from "@/lib/pastes/analytics"
import { getSiteOrigin } from "@/lib/site"

export const metadata = { title: "Analytics · Sniptide" }

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function Page({ searchParams }: PageProps<"/analytics">) {
  const query = await searchParams
  const [, report, { host }] = await Promise.all([
    requireSession(),
    getAnalyticsReport({ range: parseRange(first(query.range)), paste: first(query.paste) }),
    getSiteOrigin(),
  ])
  const views = report.kpis[0]?.value ?? 0

  return (
    <>
      <AnalyticsBreadcrumb />
      <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
        <PageHeader
          title="Analytics"
          description={
            report.scope
              ? `Views of ${report.scope.title}`
              : `Views across all ${report.pasteCount} pastes`
          }
          actions={
            <AnalyticsControls
              range={report.range}
              paste={report.scope?.slug}
              options={report.pasteOptions}
            />
          }
          className="lg:items-end"
        />

        <Overview kpis={report.kpis} points={report.points} rangeLabel={report.rangeLabel} />

        <div className="grid gap-5 lg:grid-cols-[705fr_393fr] lg:gap-6">
          <TopPastes rows={report.topPastes} total={views} host={host} />
          <Referrers rows={report.referrers} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
          <Countries rows={report.countries} total={views} />
          <Devices rows={report.devices} />
          <Languages rows={report.languages} total={views} />
        </div>
      </div>
    </>
  )
}
