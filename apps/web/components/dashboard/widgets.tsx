"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { ArrowRightIcon, KeyRoundIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { CollectionIcon } from "@/components/collections/icon"
import {
  ExpiryLabel,
  expiryClass,
  PasteMobileList,
  PasteTable,
} from "@/components/lists/paste-table"
import { LoadingRegion } from "@/components/loading/region"
import { NavigationLink as Link } from "@/components/navigation-link"
import { AgentLogo } from "@/components/onboarding/agent-logos"
import { LanguageIcon } from "@/components/paste/language-icon"
import { navigateTabs } from "@/components/tab-navigation"
import type { AgentActivity } from "@/lib/agents"
import type { WidgetId } from "@/lib/dashboard/widgets"
import { formatNumber } from "@/lib/format"
import type { DashboardData } from "@/lib/pastes/dashboard"
import type { PasteRow } from "@/lib/pastes/rows"
import { DAY } from "@/lib/time"
import { ViewsBarChart } from "./views-chart"

export type DashboardSource = DashboardData | Promise<DashboardData>

export function useDashboardData(source: DashboardSource) {
  return "then" in source ? React.use(source) : source
}

// The name each widget goes by in its heading, the Add widget menu and the Customize bar.
export function useWidgetName() {
  const t = useTranslations("Workspace")
  return (widget: WidgetId) =>
    ({
      agents: t("widget_agents"),
      agent_activity: t("widget_agent_activity"),
      agent_pastes: t("widget_agent_pastes"),
      recent_pastes: t("recent_pastes"),
      starred: t("starred"),
      expiring: t("widget_expiring"),
      popular: t("widget_popular"),
      secrets: t("secrets"),
      collections: t("collections"),
    })[widget]
}

const linkClass =
  "flex min-h-10 shrink-0 items-center gap-1 text-sm font-medium outline-none hover:text-link focus-visible:underline lg:min-h-0 lg:text-[13px]"

function ViewAll({ href }: { href: string }) {
  const t = useTranslations("Workspace")
  return (
    <Link href={href} className={linkClass}>
      {t("view_all")}
      <ArrowRightIcon className="size-3.5" />
    </Link>
  )
}

// A list widget: a bordered panel with its name, a link to the full page and a short list.
function ListWidget({
  id,
  href,
  children,
}: {
  id: WidgetId
  href?: string
  children: React.ReactNode
}) {
  const name = useWidgetName()
  return (
    <section
      aria-labelledby={`widget-${id}`}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border"
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-1.5">
        <h2 id={`widget-${id}`} className="text-[15px] font-semibold">
          {name(id)}
        </h2>
        {href ? <ViewAll href={href} /> : null}
      </div>
      {children}
    </section>
  )
}

function ListEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-sm leading-5 text-muted-foreground">{children}</p>
}

function ListRows({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col divide-y divide-border">{children}</ul>
}

const rowClass = "relative flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
const rowLinkClass =
  "min-w-0 flex-1 truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"

function PasteListRow({ row, value }: { row: PasteRow; value: React.ReactNode }) {
  return (
    <li className={rowClass}>
      <LanguageIcon language={row.language} />
      <Link href={`/pastes/${row.slug}`} title={row.title} className={rowLinkClass}>
        {row.title}
      </Link>
      <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{value}</span>
    </li>
  )
}

function WidgetLoading({ id }: { id: WidgetId }) {
  const t = useTranslations("Workspace")
  return (
    <ListWidget id={id}>
      <LoadingRegion className="px-4 py-8 text-sm text-muted-foreground">
        <span>{t("loading")}</span>
      </LoadingRegion>
    </ListWidget>
  )
}

// Reads the widget's rows from the page data. A widget added a moment ago has none until the page
// reloads its data, and shows the loading line meanwhile.
export function DataWidget({
  id,
  data: source,
  origin,
}: {
  id: Exclude<WidgetId, "agents">
  data: DashboardSource
  origin: string
}) {
  const data = useDashboardData(source)
  const t = useTranslations("Workspace")
  const secretsT = useTranslations("Secrets")

  switch (id) {
    case "agent_activity":
      return data.agentActivity ? (
        <AgentActivityWidget activity={data.agentActivity} />
      ) : (
        <WidgetLoading id={id} />
      )
    case "agent_pastes":
      return data.agentPastes ? (
        <TableWidget id={id} href="/pastes" rows={data.agentPastes} origin={origin}>
          {t("widget_agent_pastes_empty")}
        </TableWidget>
      ) : (
        <WidgetLoading id={id} />
      )
    case "recent_pastes":
      return data.recent ? (
        <RecentPastes rows={data.recent} origin={origin} />
      ) : (
        <WidgetLoading id={id} />
      )
    case "starred":
      return data.starred ? (
        <TableWidget id={id} href="/starred" rows={data.starred} origin={origin} action="unstar">
          {t("star_a_paste_to_keep_it_here")}
        </TableWidget>
      ) : (
        <WidgetLoading id={id} />
      )
    case "expiring":
      if (!data.expiring) return <WidgetLoading id={id} />
      return (
        <ListWidget id={id} href="/pastes?sort=expires">
          {data.expiring.length === 0 ? (
            <ListEmpty>{t("widget_expiring_empty")}</ListEmpty>
          ) : (
            <ListRows>
              {data.expiring.map((row) => (
                <PasteListRow
                  key={row.slug}
                  row={row}
                  value={
                    <span className={expiryClass(row)}>
                      <ExpiryLabel row={row} />
                    </span>
                  }
                />
              ))}
            </ListRows>
          )}
        </ListWidget>
      )
    case "popular":
      if (!data.popular) return <WidgetLoading id={id} />
      return (
        <ListWidget id={id} href="/pastes?sort=views">
          {data.popular.length === 0 ? (
            <ListEmpty>{t("widget_popular_empty")}</ListEmpty>
          ) : (
            <ListRows>
              {data.popular.map((row) => (
                <PasteListRow
                  key={row.slug}
                  row={row}
                  value={t("views_count", { count: row.views })}
                />
              ))}
            </ListRows>
          )}
        </ListWidget>
      )
    case "secrets":
      if (!data.secrets) return <WidgetLoading id={id} />
      return (
        <ListWidget id={id} href="/secrets">
          {data.secrets.length === 0 ? (
            <ListEmpty>
              {secretsT("empty_list")}{" "}
              <Link href="/secrets/new" className="font-medium text-link hover:underline">
                {secretsT("create_first_group")}
              </Link>
            </ListEmpty>
          ) : (
            <ListRows>
              {data.secrets.map((group) => (
                <li key={group.id} className={cn(rowClass, "ph-no-capture")}>
                  <KeyRoundIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <Link
                    href={`/secrets/${group.id}`}
                    title={group.slug}
                    className={cn(rowLinkClass, "font-mono text-[13px] font-normal")}
                  >
                    {group.slug}
                  </Link>
                  <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                    {group.environment
                      ? secretsT(group.environment)
                      : secretsT("variable_count", { count: group.count })}
                  </span>
                </li>
              ))}
            </ListRows>
          )}
        </ListWidget>
      )
    case "collections":
      if (!data.collections) return <WidgetLoading id={id} />
      return (
        <ListWidget id={id}>
          {data.collections.length === 0 ? (
            <ListEmpty>{t("no_collections_yet")}</ListEmpty>
          ) : (
            <ListRows>
              {data.collections.slice(0, 5).map((collection) => (
                <li key={collection.slug} className={rowClass}>
                  <CollectionIcon icon={collection.icon} hue={collection.hue} className="size-4" />
                  <Link href={`/collections/${collection.slug}`} className={rowLinkClass}>
                    {collection.name}
                  </Link>
                  <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                    {t("paste_count", { count: collection.pasteCount })}
                  </span>
                </li>
              ))}
            </ListRows>
          )}
        </ListWidget>
      )
  }
}

// A widget that shows the same table as the Pastes page, without sorting or selection.
function TableWidget({
  id,
  href,
  rows,
  origin,
  action,
  tabs,
  panel,
  children: empty,
}: {
  id: WidgetId
  href: string
  rows: PasteRow[]
  origin: string
  action?: "menu" | "unstar"
  tabs?: React.ReactNode
  // The tab panel's id and label, when tabs filter the rows.
  panel?: { id: string; labelledBy: string }
  // What the widget says when it has no rows.
  children: React.ReactNode
}) {
  const name = useWidgetName()
  const body =
    rows.length === 0 ? (
      <p className="py-6 text-sm leading-5 text-muted-foreground lg:px-4 lg:py-8">{empty}</p>
    ) : (
      <>
        <PasteTable
          rows={rows}
          origin={origin}
          action={action}
          className="hidden @min-[880px]/widget:table"
        />
        <PasteMobileList
          rows={rows}
          origin={origin}
          className="flex lg:px-4 lg:[&>li:last-child]:border-b-0 @min-[880px]/widget:hidden"
        />
      </>
    )
  return (
    <section
      aria-labelledby={`widget-${id}`}
      className="flex min-w-0 flex-col lg:overflow-hidden lg:rounded-lg lg:border lg:border-border"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-1.5 lg:min-h-12 @min-[880px]/widget:flex-nowrap lg:border-b lg:border-border lg:px-4">
        <div className="contents @min-[880px]/widget:flex @min-[880px]/widget:items-center @min-[880px]/widget:gap-4">
          <h2 id={`widget-${id}`} className="text-[15px] font-semibold">
            {name(id)}
          </h2>
          {tabs}
        </div>
        <ViewAll href={href} />
      </div>
      {panel ? (
        <div id={panel.id} role="tabpanel" aria-labelledby={panel.labelledBy}>
          {body}
        </div>
      ) : (
        body
      )}
    </section>
  )
}

type Tab = "all" | "public" | "unlisted" | "private"
const TABS = ["all", "public", "unlisted", "private"] as const

function RecentPastes({ rows: all, origin }: { rows: PasteRow[]; origin: string }) {
  const t = useTranslations("Workspace")
  const [tab, setTab] = React.useState<Tab>("all")
  const panelId = React.useId()

  // A brand-new account gets one line instead of an empty table with tabs.
  if (all.length === 0)
    return (
      <TableWidget id="recent_pastes" href="/pastes" rows={[]} origin={origin}>
        {t("dashboard_empty")}{" "}
        <Link href="/new" className="font-medium text-link hover:underline">
          {t("create_a_paste")}
        </Link>
      </TableWidget>
    )

  const rows = all
    .filter((row) => tab === "all" || (row.visibility === tab && !row.burnAfterRead))
    .slice(0, 5)
  return (
    <TableWidget
      id="recent_pastes"
      href="/pastes"
      rows={rows}
      origin={origin}
      panel={{ id: panelId, labelledBy: `${panelId}-tab-${tab}` }}
      tabs={
        <div
          role="tablist"
          aria-label={t("filter_recent_pastes")}
          className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] @min-[880px]/widget:order-none @min-[880px]/widget:mx-0 @min-[880px]/widget:w-auto @min-[880px]/widget:px-0"
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
      }
    >
      {t("no_recent_pastes", { visibility: tab })}{" "}
      <Link href="/new" className="font-medium text-link hover:underline">
        {t("create_one")}
      </Link>
    </TableWidget>
  )
}

export function WidgetFallback({ id }: { id: WidgetId }) {
  return <WidgetLoading id={id} />
}

// Requests from connected agents per UTC day, with each agent's share of them beside the chart.
function AgentActivityWidget({ activity }: { activity: AgentActivity }) {
  const t = useTranslations("Workspace")
  const locale = useLocale()
  const total = activity.days.reduce((sum, day) => sum + day.requests, 0)
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" })
  const labels = activity.days.map((day) => date.format(new Date(day.day * DAY)))
  const values = activity.days.map((day) => day.requests)
  return (
    <ListWidget id="agent_activity" href="/settings?tab=usage">
      {total === 0 ? (
        <ListEmpty>{t("widget_agent_activity_empty")}</ListEmpty>
      ) : (
        <div className="flex flex-col gap-5 p-4 @3xl/widget:flex-row @3xl/widget:gap-8 lg:p-5">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-sm leading-5 text-muted-foreground">
              {t("agent_requests_total", { count: total })}
            </p>
            <ViewsBarChart
              values={values}
              labels={labels}
              label={t("agent_requests_per_day", {
                values: values
                  .map((value, index) => `${labels[index]} ${formatNumber(value, locale)}`)
                  .join(", "),
              })}
              className="h-48 lg:h-44"
            />
          </div>
          <ul className="flex flex-col divide-y divide-border @3xl/widget:w-64 @3xl/widget:shrink-0">
            {activity.agents.map((agent) => (
              <li key={agent.name} className="flex min-h-10 items-center gap-3 py-2">
                <AgentLogo client={agent.client} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
                <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                  {t("agent_requests_count", { count: agent.requests })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ListWidget>
  )
}
