"use client"

import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"
import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { ImportGistButton } from "@/components/lists/import-gist"
import { expiryClass, RowBadge } from "@/components/lists/paste-list"
import { RowMenu } from "@/components/lists/row-menu"
import { LanguageLabel, LanguageMarker } from "@/components/paste/language-marker"
import { formatNumber } from "@/lib/format"
import type { DashboardData } from "@/lib/pastes/dashboard"
import type { PasteRow } from "@/lib/pastes/rows"
import { QuickPaste } from "./quick-paste"
import { ViewsBarChart } from "./views-chart"

type Range = "1" | "7" | "30"
type Tab = "all" | "public" | "unlisted" | "private"

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function trend(current: number, previous: number, locale: string) {
  if (previous === 0) return current > 0 ? "new" : null
  const change = ((current - previous) / previous) * 100
  const digits = Math.abs(change) < 10 ? 1 : 0
  return new Intl.NumberFormat(locale, {
    style: "percent",
    signDisplay: "always",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(change / 100)
}

// Greets in the viewer's own time of day, which only the browser knows; the server renders a
// neutral greeting first.
function Greeting({ firstName }: { firstName: string }) {
  const t = useTranslations("Workspace")
  const [part, setPart] = React.useState<"morning" | "afternoon" | "evening" | null>(null)

  React.useEffect(() => {
    const hour = new Date().getHours()
    setPart(hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening")
  }, [])

  return (
    <h1 className="font-heading text-[28px] leading-8 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10">
      {t(
        part === "morning"
          ? "good_morning"
          : part === "afternoon"
            ? "good_afternoon"
            : part === "evening"
              ? "good_evening"
              : "hello_named",
        { name: firstName },
      )}
    </h1>
  )
}

function Stat({
  label,
  value,
  note,
  noteTone = "muted",
  className,
}: {
  label: string
  value: string
  note?: React.ReactNode
  noteTone?: "muted" | "primary"
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 px-4 py-4 lg:px-5", className)}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-heading text-[26px] leading-9 font-bold tracking-[-0.02em] tabular-nums lg:text-3xl">
          {value}
        </span>
        {note ? (
          <span
            className={cn(
              "text-xs",
              noteTone === "primary" ? "font-medium text-link" : "text-muted-foreground",
            )}
          >
            {note}
          </span>
        ) : null}
      </span>
    </div>
  )
}

export function Dashboard({
  data,
  firstName,
  origin,
  host,
  defaults,
}: {
  defaults: React.ComponentProps<typeof QuickPaste>["defaults"]
  data: DashboardData
  firstName: string
  origin: string
  host: string
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const rangeLabels: Record<Range, string> = {
    "1": t("today"),
    "7": t("this_week"),
    "30": t("this_month"),
  }
  const [range, setRange] = React.useState<Range>("7")
  const [tab, setTab] = React.useState<Tab>("all")
  const days = Number(range)

  const views = sum(data.dailyViews.slice(-days))
  const previousViews = sum(data.dailyViews.slice(-2 * days, -days))
  const viewsTrend = trend(views, previousViews, locale)
  const created = data.newPastes[range]

  // The chart always shows at least a week so a single day still has context.
  const chartDays = Math.max(7, days)
  const chartValues = data.dailyViews.slice(-chartDays)
  const chartLabels = (chartDays > 7 ? data.dayDates : data.dayNames).slice(-chartDays)
  const peakIndex = chartValues.indexOf(Math.max(...chartValues))

  const recent = data.recent
    .filter((row) => tab === "all" || (row.visibility === tab && !row.burnAfterRead))
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <div className="flex flex-col gap-1.5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <Greeting firstName={firstName} />
          <p className="text-[15px] leading-5 text-muted-foreground lg:hidden">
            {t("opens_in_period", { count: views, period: rangeLabels[range] })}{" "}
            {data.expiringSoon > 0
              ? t("expiring_links", { count: data.expiringSoon })
              : t("nothing_expires_in_the_next_48_hours")}
          </p>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <SegmentedControl
            aria-label={t("range")}
            value={range}
            onValueChange={setRange}
            options={[
              { value: "1", label: t("24h") },
              { value: "7", label: t("7_days") },
              { value: "30", label: t("30_days") },
            ]}
            className="w-56"
            itemClassName="py-[5px]"
          />
          <ImportGistButton />
        </div>
      </div>

      <div className="grid grid-cols-2 rounded-lg border border-border lg:grid-cols-4">
        <Stat
          label={t("total_pastes")}
          value={formatNumber(data.totalPastes, locale)}
          note={
            created > 0
              ? t("created_in_period", { count: created, period: rangeLabels[range] })
              : undefined
          }
          noteTone="primary"
          className="border-r border-b border-border lg:border-b-0"
        />
        <Stat
          label={t("views")}
          value={formatNumber(views, locale)}
          note={viewsTrend === "new" ? t("new") : (viewsTrend ?? undefined)}
          noteTone="primary"
          className="border-b border-border lg:border-r lg:border-b-0"
        />
        <Stat
          label={t("active_share_links")}
          value={formatNumber(data.activeLinks, locale)}
          note={
            data.passwordProtected > 0
              ? t("password_protected_count", { count: data.passwordProtected })
              : undefined
          }
          className="border-r border-border"
        />
        <Stat
          label={t("expiring_in_48h")}
          value={formatNumber(data.expiringSoon, locale)}
          note={
            data.expiringSoon > 0 ? (
              <Link
                href="/pastes?sort=expires"
                className="font-medium text-foreground underline underline-offset-2 hover:text-link"
              >
                {t("review")}
              </Link>
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="hidden min-w-0 flex-[1.8] lg:flex">
          <QuickPaste defaults={defaults} />
        </div>
        <section
          aria-labelledby="views-heading"
          className="flex min-w-0 flex-1 flex-col gap-4 rounded-lg border border-border px-4 py-4 lg:px-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="views-heading" className="text-sm font-semibold">
                <span className="lg:hidden">
                  {t("views_in_period", {
                    period: chartDays > 7 ? t("this_month") : t("this_week"),
                  })}
                </span>
                <span className="hidden lg:inline">{t("views")}</span>
              </h2>
              <p className="hidden text-[13px] text-muted-foreground lg:block">
                {t("across_all_share_links")}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 pt-0.5">
              <Link
                href="/analytics"
                className="flex items-center gap-1 text-[13px] font-medium text-link outline-none hover:underline focus-visible:underline"
              >
                {t("view_analytics")}
                <ArrowRightIcon className="size-3.5" />
              </Link>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden size-2 bg-chart-1 lg:block" />
                <span className="hidden lg:inline">
                  {chartDays > 7 ? t("last_30_days") : t("last_7_days")}
                </span>
                <span className="lg:hidden">
                  {t("peak_summary", {
                    day: chartLabels[peakIndex] ?? "",
                    count: formatNumber(chartValues[peakIndex] ?? 0, locale),
                  })}
                </span>
              </span>
            </div>
          </div>
          <ViewsBarChart values={chartValues} labels={chartLabels} className="flex-1" />
        </section>
      </div>

      <section
        aria-labelledby="recent-heading"
        className="flex flex-col lg:overflow-hidden lg:rounded-lg lg:border lg:border-border"
      >
        <div className="flex items-center justify-between gap-3 py-3 lg:border-b lg:border-border lg:px-4">
          <div className="flex items-center gap-4">
            <h2 id="recent-heading" className="text-[15px] font-semibold lg:text-[15px]">
              {t("recent_pastes")}
            </h2>
            <div
              role="tablist"
              aria-label={t("filter_recent_pastes")}
              className="hidden items-center gap-1 lg:flex"
            >
              {(["all", "public", "unlisted", "private"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn(
                    "h-7 rounded-md px-3 text-[13px] text-muted-foreground capitalize outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                    tab === value && "border border-border text-foreground",
                  )}
                >
                  {t(value)}
                </button>
              ))}
            </div>
          </div>
          <Link
            href="/pastes"
            className="flex items-center gap-1 text-sm font-medium hover:text-link lg:text-[13px]"
          >
            {t("view_all")}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("no_recent_pastes", { visibility: tab })}{" "}
            <Link href="/new" className="font-medium text-link hover:underline">
              {t("create_one")}
            </Link>
          </p>
        ) : (
          <>
            <RecentTable rows={recent} origin={origin} host={host} />
            <ul className="flex flex-col lg:hidden">
              {recent.map((row) => (
                <li
                  key={row.slug}
                  className="relative flex items-center gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <LanguageMarker language={row.language} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      href={`/pastes/${row.slug}`}
                      className="truncate text-[15px] font-medium after:absolute after:inset-0"
                    >
                      {row.title}
                    </Link>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {host}/{row.slug} · {row.updatedLabel}
                    </span>
                  </div>
                  <RowBadge row={row} short />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function RecentTable({ rows, origin, host }: { rows: PasteRow[]; origin: string; host: string }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  return (
    <Table className="hidden table-fixed lg:table">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("paste")}</TableHead>
          <TableHead className="w-[130px]">{t("language")}</TableHead>
          <TableHead className="w-[156px]">{t("visibility")}</TableHead>
          <TableHead className="w-20 text-right">{t("views")}</TableHead>
          <TableHead className="w-[130px] pl-7">{t("expires")}</TableHead>
          <TableHead className="w-[116px]">{t("updated")}</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">{t("actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.slug} className="relative">
            <TableCell className="truncate">
              <Link
                href={`/pastes/${row.slug}`}
                className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
              >
                {row.title}
              </Link>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {host}/{row.slug}
              </span>
            </TableCell>
            <TableCell className="text-[13px] text-foreground/80">
              <LanguageLabel language={row.language} />
            </TableCell>
            <TableCell>
              <RowBadge row={row} />
            </TableCell>
            <TableCell className="text-right font-mono text-[13px] tabular-nums">
              {formatNumber(row.views, locale)}
            </TableCell>
            <TableCell className={cn("pl-7 text-[13px] text-foreground/80", expiryClass(row))}>
              {row.expiresLabel}
            </TableCell>
            <TableCell className="text-[13px] text-muted-foreground">{row.updatedLabel}</TableCell>
            <TableCell className="pr-3 text-right">
              <RowMenu row={row} origin={origin} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
