import { Skeleton } from "@sniptide/ui/components/skeleton"
import { cn } from "@sniptide/ui/lib/utils"
import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"
import { getLocale, getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AnalyticsControls } from "@/components/analytics-page/controls"
import { Overview } from "@/components/analytics-page/overview"
import {
  Countries,
  Devices,
  Languages,
  Referrers,
  TopPastes,
} from "@/components/analytics-page/panels"
import { AnalyticsReportSkeleton } from "@/components/loading/page-skeletons"
import { LoadingRegion } from "@/components/loading/region"
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
  const [locale, t, workspace, query, , { host }] = await Promise.all([
    getLocale(),
    getTranslations("Core"),
    getTranslations("Workspace"),
    searchParams,
    requireSession(),
    getSiteOrigin(),
  ])
  const report = getAnalyticsReport(
    {
      range: parseRange(first(query.range)),
      paste: first(query.paste),
      collection: first(query.collection),
    },
    Date.now(),
    locale,
  )
  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <PageHeader
        title={t("analytics")}
        description={
          <Suspense
            fallback={
              <LoadingRegion>
                <Skeleton className="h-4 w-48" />
              </LoadingRegion>
            }
          >
            <ReportDescription report={report} />
          </Suspense>
        }
        actions={
          <Suspense
            fallback={
              <LoadingRegion>
                <Skeleton className="h-10 w-64 max-w-full" />
              </LoadingRegion>
            }
          >
            <ReportControls report={report} />
          </Suspense>
        }
        className="lg:items-end max-lg:[&>div:last-child]:w-full"
      />
      <Suspense fallback={<AnalyticsReportSkeleton />}>
        <ReportContent
          report={report}
          host={host}
          emptyMessage={workspace("analytics_empty")}
          emptyAction={workspace("analytics_empty_top_pastes_action")}
        />
      </Suspense>
    </div>
  )
}

type Report = Promise<Awaited<ReturnType<typeof getAnalyticsReport>>>

async function ReportDescription({ report: source }: { report: Report }) {
  const [report, t] = await Promise.all([source, getTranslations("Core")])
  return report.scope?.type === "paste"
    ? t("viewsOf", { title: report.scope.title })
    : report.scope
      ? t("viewsIn", { count: report.pasteCount, title: report.scope.title })
      : t("viewsAll", { count: report.pasteCount })
}

async function ReportControls({ report: source }: { report: Report }) {
  const report = await source
  return (
    <AnalyticsControls
      range={report.range}
      paste={report.scope?.type === "paste" ? report.scope.slug : undefined}
      options={report.pasteOptions}
    />
  )
}

async function ReportContent({
  report: source,
  host,
  emptyMessage,
  emptyAction,
}: {
  report: Report
  host: string
  emptyMessage: string
  emptyAction: string
}) {
  const report = await source
  const views = report.kpis[0]?.value ?? 0
  return (
    <>
      <Overview
        kpis={report.kpis}
        points={report.points}
        rangeLabel={report.rangeLabel}
        empty={views === 0}
      />

      {/* With no views at all, phones get one empty state instead of five empty cards. */}
      {views === 0 ? (
        <div className="rounded-lg flex flex-col items-start gap-2 border border-border p-4 lg:hidden">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          <Link
            href="/new"
            className="flex items-center gap-1 text-sm font-medium text-link outline-none hover:underline focus-visible:underline"
          >
            {emptyAction}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-5 lg:grid-cols-[705fr_393fr] lg:gap-6",
          views === 0 && "max-lg:hidden",
        )}
      >
        <TopPastes rows={report.topPastes} total={views} host={host} />
        <Referrers rows={report.referrers} />
      </div>

      <div className={cn("grid gap-5 lg:grid-cols-3 lg:gap-6", views === 0 && "max-lg:hidden")}>
        <Countries rows={report.countries} total={views} />
        <Devices rows={report.devices} />
        <Languages rows={report.languages} total={views} />
      </div>
    </>
  )
}
