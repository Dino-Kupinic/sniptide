"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { DownloadIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { useCommandMenu } from "@/components/command-menu/command-menu"
import { GroupedCanvas, GroupedList, groupedPanelClass } from "@/components/lists/grouped-list"
import { LanguageIcon } from "@/components/paste/language-icon"
import type { AnalyticsSeries } from "@/lib/pastes/analytics"
import type { PasteRow } from "@/lib/pastes/rows"
import { type DashboardSource, useDashboardData } from "./widgets"

// How many recent pastes the phone's home lists before See all.
const RECENT_ROWS = 3

// The phone's home screen below lg, in place of the widget board: New paste and Import gist as two
// tiles, the latest pastes and this week's views. The widgets stay on desktop, where they have room.
export function PhoneHome({
  data,
  week,
}: {
  data: DashboardSource
  week: Promise<AnalyticsSeries>
}) {
  const t = useTranslations("Workspace")
  const { importGist } = useCommandMenu()
  const tileClass =
    "flex h-[76px] flex-col justify-between rounded-lg p-3.5 text-left text-base leading-5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:opacity-80"
  return (
    <div className="flex flex-col gap-7 lg:hidden">
      <GroupedCanvas />
      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/new" className={cn(tileClass, "bg-primary text-primary-foreground")}>
          <PlusIcon aria-hidden className="size-5" strokeWidth={2} />
          {t("new_paste")}
        </Link>
        <button type="button" onClick={() => importGist?.()} className={cn(tileClass, "bg-card")}>
          <DownloadIcon aria-hidden className="size-5 text-link" strokeWidth={2} />
          {t("import_gist")}
        </button>
      </div>
      <React.Suspense fallback={null}>
        <RecentPastes data={data} />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <WeekViews week={week} />
      </React.Suspense>
    </div>
  )
}

// The line under the greeting on phones: this week's views of the viewer's pastes.
export function WeekViewsLine({ week }: { week: Promise<AnalyticsSeries> }) {
  const t = useTranslations("Workspace")
  const { points } = React.use(week)
  const total = points.reduce((sum, point) => sum + point.values.views, 0)
  return (
    <p className="text-[15px] leading-5 text-muted-foreground lg:hidden">
      {t("home_views_this_week", { count: total })}
    </p>
  )
}

function RecentPastes({ data: source }: { data: DashboardSource }) {
  const t = useTranslations("Workspace")
  const rows = (useDashboardData(source).recent ?? []).slice(0, RECENT_ROWS)
  if (rows.length === 0) return null
  return (
    <GroupedList
      label={t("home_recent")}
      action={
        <Link
          href="/pastes"
          className="text-[13px] leading-4 text-link outline-none focus-visible:underline"
        >
          {t("view_all")}
        </Link>
      }
    >
      {rows.map((row) => (
        <RecentRow key={row.slug} row={row} />
      ))}
    </GroupedList>
  )
}

function RecentRow({ row }: { row: PasteRow }) {
  const t = useTranslations("Workspace")
  return (
    <li className="group/item relative flex min-h-[60px] items-center gap-3 pl-4 active:bg-muted">
      <LanguageIcon language={row.language} className="size-5" />
      <div className="flex min-w-0 flex-1 items-center gap-3 self-stretch pr-4 group-not-last/item:border-b group-not-last/item:border-border">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5">
          <Link
            href={`/pastes/${row.slug}`}
            title={row.title}
            className="truncate text-[17px] leading-[22px] outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {row.title}
          </Link>
          <span className="truncate text-[13px] leading-4 text-muted-foreground">
            {row.burnAfterRead ? t("burn_after_read") : t(row.visibility)}
            {row.views > 0 ? ` · ${t("views_count", { count: row.views })}` : ""}
          </span>
        </div>
        <span className="shrink-0 text-[15px] text-muted-foreground">{row.updatedLabel}</span>
      </div>
    </li>
  )
}

// Seven days of views as solid bars on one scale, with the busiest day in the highlight color.
function WeekViews({ week }: { week: Promise<AnalyticsSeries> }) {
  const t = useTranslations("Workspace")
  const { points } = React.use(week)
  const values = points.map((point) => point.values.views)
  const max = Math.max(1, ...values)
  const peak = values.some((value) => value > 0) ? values.indexOf(max) : -1
  // A week without views leaves the line under the greeting to say so.
  if (peak < 0) return null
  return (
    <section aria-label={t("home_this_week")} className="flex flex-col gap-1.5">
      <h2 className="px-4 text-[13px] leading-4 text-muted-foreground">{t("home_this_week")}</h2>
      <div className={cn(groupedPanelClass, "px-4 py-4")}>
        <ol className="flex h-[68px] items-end gap-2">
          {points.map((point, index) => (
            <li key={point.date} className="flex h-full flex-1 items-end">
              <span className="sr-only">
                {point.label}: {t("views_count", { count: point.values.views })}
              </span>
              <span
                aria-hidden
                style={{ height: `${Math.max(4, (point.values.views / max) * 100)}%` }}
                className={cn(
                  "w-full rounded-sm",
                  index === peak ? "bg-highlight" : "bg-chart-1",
                  point.values.views === 0 && "bg-muted",
                )}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
