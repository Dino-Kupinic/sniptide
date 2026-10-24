import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ArrowRightIcon,
  GlobeIcon,
  LinkIcon,
  MonitorIcon,
  SmartphoneIcon,
  TerminalIcon,
} from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import "flag-icons/css/flag-icons.min.css"
import { LanguageIcon } from "@/components/paste/language-icon"
import { formatNumber } from "@/lib/format"
import type { CountryRow, DeviceRow, LanguageRow, Referrer, TopPaste } from "@/lib/pastes/analytics"
import { getLanguage } from "@/lib/pastes/languages"
import { Card, CardEmpty, Meter } from "./card"
import { Favicon } from "./favicon"

const viewAllClass =
  "flex items-center gap-1 text-[13px] font-medium text-link outline-none hover:underline focus-visible:underline"

function share(value: number, total: number) {
  return total > 0 ? value / total : 0
}

// Rows are measured against the biggest one, so the first bar is always full.
function peakOf(rows: { views: number }[]) {
  return Math.max(1, ...rows.map((row) => row.views))
}

const rowClass = "flex shrink-0 flex-col gap-[7px] py-2"
const countClass = "font-mono text-[13px] leading-[18px] tabular-nums"
const percentClass = "w-8 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums"

// A card body that scrolls when its rows outgrow it, so the card keeps the height of its row.
function ScrollList({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-72 min-h-0 flex-1 scrollbar-subtle overflow-y-auto px-4 py-2 lg:max-h-none">
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

export function TopPastes({
  rows,
  total,
  host,
}: {
  rows: TopPaste[]
  total: number
  host: string
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const peak = Math.max(0.001, ...rows.map((row) => share(row.views, total)))

  return (
    <Card
      title={t("top_pastes")}
      action={
        <Link href="/pastes" className={viewAllClass}>
          {t("view_all")}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <CardEmpty
          action={
            <Link href="/new" className={viewAllClass}>
              {t("analytics_empty_top_pastes_action")}
              <ArrowRightIcon className="size-3.5" />
            </Link>
          }
        >
          {t("analytics_empty_top_pastes")}
        </CardEmpty>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 px-4 text-xs font-medium">{t("paste")}</TableHead>
              <TableHead className="h-9 w-20 px-0 text-right text-xs font-medium">
                {t("views")}
              </TableHead>
              <TableHead className="hidden h-9 w-20 px-0 text-right text-xs font-medium md:table-cell">
                {t("unique")}
              </TableHead>
              <TableHead className="h-9 w-24 pr-4 pl-4 text-xs font-medium sm:w-[150px] sm:pl-7">
                {t("share")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const rowShare = share(row.views, total)

              return (
                <TableRow key={row.slug} className="relative">
                  <TableCell className="h-14 min-w-0 truncate px-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex w-4 shrink-0 justify-center">
                        <LanguageIcon language={row.language} />
                      </span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <Link
                          href={`/pastes/${row.slug}`}
                          className="truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                        >
                          {row.title}
                        </Link>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {host}/{row.slug}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={cn(countClass, "px-0 text-right")}>
                    {formatNumber(row.views, locale)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      countClass,
                      "hidden px-0 text-right text-foreground/80 md:table-cell",
                    )}
                  >
                    {formatNumber(row.unique, locale)}
                  </TableCell>
                  <TableCell className={"pr-4 pl-4 sm:pl-7"}>
                    <div className="flex items-center gap-2">
                      <Meter value={rowShare / peak} className="hidden w-14 sm:flex" />
                      <span className="font-mono text-xs text-foreground/80 tabular-nums">
                        {new Intl.NumberFormat(locale, {
                          style: "percent",
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        }).format(rowShare)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}

export function Referrers({ rows }: { rows: Referrer[] }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const peak = peakOf(rows)

  return (
    <Card title={t("referrers")}>
      {rows.length === 0 ? (
        <CardEmpty>{t("analytics_empty_referrers")}</CardEmpty>
      ) : (
        <ScrollList>
          {rows.map((row) => (
            <div key={row.id} className={rowClass}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  {row.kind === "site" && row.domain ? (
                    <Favicon domain={row.domain} />
                  ) : row.kind === "other" ? (
                    <GlobeIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  ) : (
                    <LinkIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="truncate text-[13px] leading-[18px]">{row.label}</span>
                </span>
                <span className={countClass}>{formatNumber(row.views, locale)}</span>
              </div>
              <Meter value={row.views / peak} tone={row.kind === "other" ? "muted" : "link"} />
            </div>
          ))}
        </ScrollList>
      )}
    </Card>
  )
}

export function Countries({ rows, total }: { rows: CountryRow[]; total: number }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const peak = peakOf(rows)

  return (
    <Card title={t("countries")} className="lg:h-[321px]">
      {rows.length === 0 ? (
        <CardEmpty>{t("analytics_empty_countries")}</CardEmpty>
      ) : (
        <ScrollList>
          {rows.map((row) => (
            <div key={row.code} className={rowClass}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    role="img"
                    aria-label={t("flag_of", { country: row.name })}
                    className={`fi fi-${row.code} h-[15px]! w-5! shrink-0 ring-1 ring-black/10 ring-inset dark:ring-white/15`}
                  />
                  <span className="truncate text-[13px] leading-[18px]">{row.name}</span>
                </span>
                <span className="flex items-baseline gap-2.5">
                  <span className={countClass}>{formatNumber(row.views, locale)}</span>
                  <span className={percentClass}>
                    {new Intl.NumberFormat(locale, {
                      style: "percent",
                      maximumFractionDigits: 0,
                    }).format(share(row.views, total))}
                  </span>
                </span>
              </div>
              <Meter value={row.views / peak} />
            </div>
          ))}
        </ScrollList>
      )}
    </Card>
  )
}

const deviceIcons = {
  desktop: { icon: MonitorIcon, tone: "text-link", fill: "bg-chart-1" },
  mobile: {
    icon: SmartphoneIcon,
    tone: "text-highlight",
    fill: "bg-highlight",
  },
  cli: {
    icon: TerminalIcon,
    tone: "text-muted-foreground",
    fill: "bg-muted-foreground/45",
  },
} as const

export function Devices({ rows }: { rows: DeviceRow[] }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const total = rows.reduce((sum, row) => sum + row.views, 0)

  return (
    <Card title={t("devices")} className="lg:h-[321px]">
      {total === 0 ? (
        <CardEmpty>{t("analytics_empty_devices")}</CardEmpty>
      ) : (
        <div className="flex flex-col gap-6 px-4 py-6">
          <div
            role="img"
            aria-label={t("share_of_views_by_device")}
            className="flex h-7 gap-0.5 overflow-hidden rounded-md"
          >
            {rows.map((row) => (
              <span
                key={row.id}
                className={deviceIcons[row.id].fill}
                style={{ flex: `${row.views} 1 0%` }}
              />
            ))}
          </div>
          <ul className="flex flex-col gap-[18px]">
            {rows.map((row) => {
              const { icon: Icon, tone } = deviceIcons[row.id]

              return (
                <li key={row.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-[13px] leading-[18px]">
                    <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone)} />
                    {row.label}
                  </span>
                  <span className="flex items-baseline gap-2.5">
                    <span className={countClass}>{formatNumber(row.views, locale)}</span>
                    <span className={percentClass}>
                      {new Intl.NumberFormat(locale, {
                        style: "percent",
                        maximumFractionDigits: 0,
                      }).format(share(row.views, total))}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

export function Languages({ rows, total }: { rows: LanguageRow[]; total: number }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const peak = peakOf(rows)

  return (
    <Card title={t("languages")} className="lg:h-[321px]">
      {rows.length === 0 ? (
        <CardEmpty>{t("analytics_empty_languages")}</CardEmpty>
      ) : (
        <ScrollList>
          {rows.map((row) => (
            <div key={row.language} className={rowClass}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <LanguageIcon language={row.language} />
                  <span className="truncate text-[13px] leading-[18px]">
                    {getLanguage(row.language).name}
                  </span>
                </span>
                <span className={percentClass}>
                  {new Intl.NumberFormat(locale, {
                    style: "percent",
                    maximumFractionDigits: 0,
                  }).format(share(row.views, total))}
                </span>
              </div>
              <Meter value={row.views / peak} />
            </div>
          ))}
        </ScrollList>
      )}
    </Card>
  )
}
