"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
} from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"
import { ArrowRightIcon, PlusIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { ImportGistButton } from "@/components/lists/import-gist"
import { ExpiryLabel, expiryClass, RowBadge, VisibilityIcon } from "@/components/lists/paste-list"
import { RowMenu } from "@/components/lists/row-menu"
import { LoadingRegion } from "@/components/loading/region"
import { NavigationLink as Link } from "@/components/navigation-link"
import { ExpiredBadge } from "@/components/paste/expiry-status"
import { LanguageIcon, LanguageLabel } from "@/components/paste/language-icon"
import { navigateTabs } from "@/components/tab-navigation"
import type { ConnectedAgent } from "@/lib/agents"
import { track } from "@/lib/analytics"
import { formatNumber } from "@/lib/format"
import type { DashboardData } from "@/lib/pastes/dashboard"
import type { PasteRow } from "@/lib/pastes/rows"
import { AgentArea } from "./agent-area"

type Tab = "all" | "public" | "unlisted" | "private"
const TABS = ["all", "public", "unlisted", "private"] as const

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
    <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10">
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

// The signed-in home: what needs attention, the agent connection and the latest pastes. Figures
// and charts live on /analytics.
export function Dashboard({
  data,
  agents,
  agentCardHidden,
  firstName,
  origin,
  appOrigin,
  host,
}: {
  data: DashboardData | Promise<DashboardData>
  agents: ConnectedAgent[]
  agentCardHidden: boolean
  firstName: string
  // The share-link origin for row links, and the app's own origin for the MCP server address.
  origin: string
  appOrigin: string
  host: string
}) {
  const t = useTranslations("Workspace")

  // Once per visit with the count the page loaded with; later agent changes are their own events.
  const agentsOnLoad = React.useRef(agents.length)
  React.useEffect(() => {
    track("dashboard_viewed", { agents_connected: agentsOnLoad.current })
  }, [])

  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Greeting firstName={firstName} />
          <React.Suspense fallback={null}>
            <AttentionLine data={data} />
          </React.Suspense>
        </div>
        <div className="flex items-center gap-2">
          {/* Import gist lives in the More sheet on phones. */}
          <span className="hidden lg:contents">
            <ImportGistButton />
          </span>
          <Button
            size="lg"
            className="max-lg:h-10"
            render={<Link href="/new" />}
            nativeButton={false}
          >
            <PlusIcon />
            {t("new_paste")}
          </Button>
        </div>
      </div>

      <AgentArea agents={agents} origin={appOrigin} hidden={agentCardHidden} />

      <React.Suspense
        fallback={
          <section aria-labelledby="recent-heading" className="flex flex-col">
            <h2 id="recent-heading" className="py-3 text-[15px] font-semibold">
              {t("recent_pastes")}
            </h2>
            <LoadingRegion className="py-10 text-sm text-muted-foreground">
              <span>{t("loading")}</span>
            </LoadingRegion>
          </section>
        }
      >
        <RecentPastes data={data} origin={origin} host={host} />
      </React.Suspense>
    </div>
  )
}

type DashboardSource = DashboardData | Promise<DashboardData>

function useDashboardData(source: DashboardSource) {
  return "then" in source ? React.use(source) : source
}

// One line under the greeting, shown only when a link expires within 48 hours or already has.
function AttentionLine({ data: source }: { data: DashboardSource }) {
  const data = useDashboardData(source)
  const t = useTranslations("Workspace")
  const { expiringSoon: expiring, expired } = data
  if (expiring === 0 && expired === 0) return null
  return (
    <p className="text-[15px] leading-5 text-muted-foreground lg:text-sm">
      {expiring > 0 && expired > 0
        ? t("attention_expiring_and_expired", { expiring, expired })
        : expiring > 0
          ? t("attention_expiring", { count: expiring })
          : t("attention_expired", { count: expired })}{" "}
      <Link
        href="/pastes?sort=expires"
        className="font-medium text-link outline-none hover:underline focus-visible:underline"
      >
        {t("review")}
      </Link>
    </p>
  )
}

function RecentPastes({
  data: source,
  origin,
  host,
}: {
  data: DashboardSource
  origin: string
  host: string
}) {
  const data = useDashboardData(source)
  const t = useTranslations("Workspace")
  const [tab, setTab] = React.useState<Tab>("all")
  const panelId = React.useId()

  // A brand-new account gets one line instead of an empty table with filters.
  if (data.recent.length === 0) {
    return (
      <section aria-labelledby="recent-heading" className="flex flex-col gap-1">
        <h2 id="recent-heading" className="py-2 text-[15px] font-semibold">
          {t("recent_pastes")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">
          {t("dashboard_empty")}{" "}
          <Link href="/new" className="font-medium text-link hover:underline">
            {t("create_a_paste")}
          </Link>
        </p>
      </section>
    )
  }

  const recent = data.recent
    .filter((row) => tab === "all" || (row.visibility === tab && !row.burnAfterRead))
    .slice(0, 5)
  return (
    <section
      aria-labelledby="recent-heading"
      className="flex flex-col lg:overflow-hidden lg:rounded-lg lg:border lg:border-border"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 lg:flex-nowrap lg:border-b lg:border-border lg:px-4">
        <div className="contents lg:flex lg:items-center lg:gap-4">
          <h2 id="recent-heading" className="text-[15px] font-semibold">
            {t("recent_pastes")}
          </h2>
          <div
            role="tablist"
            aria-label={t("filter_recent_pastes")}
            className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] lg:order-none lg:mx-0 lg:w-auto lg:px-0"
          >
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`${panelId}-tab-${value}`}
                aria-selected={tab === value}
                aria-controls={panelId}
                tabIndex={tab === value ? 0 : -1}
                onKeyDown={(event) => navigateTabs(event, TABS, value, setTab)}
                onClick={() => setTab(value)}
                className={cn(
                  "h-10 shrink-0 rounded-md px-3 text-sm text-muted-foreground capitalize lg:h-7 lg:text-[13px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
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

      <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-tab-${tab}`}>
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
                  <LanguageIcon language={row.language} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      href={`/pastes/${row.slug}`}
                      className="truncate text-[15px] font-medium after:absolute after:inset-0"
                    >
                      {row.title}
                    </Link>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <VisibilityIcon row={row} />
                      <span className="truncate">
                        <span className="font-mono">{row.slug}</span> · {row.updatedLabel}
                      </span>
                      <ExpiredBadge expiresAt={row.expiresAt} />
                    </span>
                  </div>
                  <RowMenu row={row} origin={origin} variant="sheet" />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

function RecentTable({ rows, origin, host }: { rows: PasteRow[]; origin: string; host: string }) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  return (
    <Table className="hidden min-w-[900px] table-fixed lg:table">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("paste")}</TableHead>
          <TableHead className="w-[130px]">{t("language")}</TableHead>
          <TableHead className="w-[156px]">{t("visibility")}</TableHead>
          <TableHead className="w-20 text-right">{t("views")}</TableHead>
          <TableHead className="w-[130px] pl-7">{t("expires")}</TableHead>
          <TableHead className="w-[116px]">{t("updated")}</TableHead>
          <TablePinnedHead className="w-12">
            <span className="sr-only">{t("actions")}</span>
          </TablePinnedHead>
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
              <ExpiryLabel row={row} />
            </TableCell>
            <TableCell className="text-[13px] text-muted-foreground">{row.updatedLabel}</TableCell>
            <TablePinnedCell className="pr-3 text-right">
              <RowMenu row={row} origin={origin} />
            </TablePinnedCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
