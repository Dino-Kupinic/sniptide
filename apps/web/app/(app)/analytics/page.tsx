import { getLocale, getTranslations } from "next-intl/server"
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
import { parseRange } from "@/lib/pastes/analytics"
import { getAnalyticsReport } from "@/lib/pastes/analytics-report"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("analytics")} · Sniptide` }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function Page({ searchParams }: PageProps<"/analytics">) {
  const locale = await getLocale()
  const t = await getTranslations("Core")
  const query = await searchParams
  const [, report, { host }] = await Promise.all([
    requireSession(),
    getAnalyticsReport(
      {
        range: parseRange(first(query.range)),
        paste: first(query.paste),
        collection: first(query.collection),
      },
      Date.now(),
      locale,
    ),
    getSiteOrigin(),
  ])
  const views = report.kpis[0]?.value ?? 0

  return (
    <>
      <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
        <PageHeader
          title={t("analytics")}
          description={
            report.scope?.type === "paste"
              ? t("viewsOf", { title: report.scope.title })
              : report.scope
                ? t("viewsIn", { count: report.pasteCount, title: report.scope.title })
                : t("viewsAll", { count: report.pasteCount })
          }
          actions={
            <AnalyticsControls
              range={report.range}
              paste={report.scope?.type === "paste" ? report.scope.slug : undefined}
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
