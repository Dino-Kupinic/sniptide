"use client"

import { Button } from "@sniptide/ui/components/button"
import { CheckIcon, PlusIcon, Settings2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { ImportGistButton } from "@/components/lists/import-gist"
import { useSidebarState, useViewer } from "@/components/shell/app-shell"
import { dayPart } from "@/components/shell/sidebar-state"
import type { ConnectedAgent } from "@/lib/agents"
import { track } from "@/lib/analytics"
import type { WidgetId, WidgetSizes } from "@/lib/dashboard/widgets"
import type { DashboardData } from "@/lib/pastes/dashboard"
import { firstName } from "@/lib/viewer"
import { AddWidgetMenu, TemplateMenu, useDashboardLayout, WidgetBoard } from "./widget-board"
import { type DashboardSource, useDashboardData } from "./widgets"

// Greets in the viewer's own time of day. The server goes by the time zone the browser left in
// the sidebar cookie and falls back to a neutral greeting on a first visit. The layout effect
// then applies the browser's clock before paint.
function Greeting({ firstName }: { firstName: string }) {
  const t = useTranslations("Workspace")
  const { timeZone } = useSidebarState()
  const [part, setPart] = React.useState(() => (timeZone ? dayPart(new Date(), timeZone) : null))

  React.useLayoutEffect(() => {
    setPart(dayPart(new Date()))
  }, [])

  return (
    <h1
      // The hour can turn between the server's render and hydration.
      suppressHydrationWarning
      className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] lg:text-4xl lg:leading-10"
    >
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

// The signed-in home: what needs attention and the widgets the person chose, starting from the
// Agents template. Figures and charts live on /analytics.
export function Dashboard({
  data,
  layout,
  sizes,
  agents,
  firstName: name,
  origin,
  appOrigin,
}: {
  data: DashboardData | Promise<DashboardData>
  layout: WidgetId[]
  sizes?: WidgetSizes
  agents: ConnectedAgent[]
  firstName: string
  // The share-link origin for row links, and the app's own origin for the MCP server address.
  origin: string
  appOrigin: string
}) {
  const dashboard = useDashboardLayout(layout, sizes)
  const [editing, setEditing] = React.useState(false)

  // Once per visit with what the page loaded with; later changes are their own events.
  const onLoad = React.useRef({ agents: agents.length, widgets: layout.join(",") })
  React.useEffect(() => {
    track("dashboard_viewed", {
      agents_connected: onLoad.current.agents,
      widgets: onLoad.current.widgets,
    })
  }, [])

  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <DashboardHeader
        firstName={name}
        attention={
          <React.Suspense fallback={null}>
            <AttentionLine data={data} />
          </React.Suspense>
        }
        editing={editing}
        onEditing={setEditing}
        editActions={
          <>
            <AddWidgetMenu dashboard={dashboard} />
            <TemplateMenu dashboard={dashboard} />
          </>
        }
      />

      <WidgetBoard
        dashboard={dashboard}
        editing={editing}
        data={data}
        agents={agents}
        origin={origin}
        appOrigin={appOrigin}
      />
    </div>
  )
}

// The greeting and the page's actions. They need nothing the page loads, so the loading state
// shows them as they are.
function DashboardHeader({
  firstName,
  attention,
  editing = false,
  onEditing,
  editActions,
}: {
  firstName: string
  attention?: React.ReactNode
  editing?: boolean
  onEditing?: (editing: boolean) => void
  editActions?: React.ReactNode
}) {
  const t = useTranslations("Workspace")
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Greeting firstName={firstName} />
        {attention}
      </div>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          {editActions}
          <Button size="lg" className="max-lg:h-10" onClick={() => onEditing?.(false)}>
            <CheckIcon />
            {t("done")}
          </Button>
        </div>
      ) : (
        // The loading state draws these before the page can answer a press. Until then they are
        // inert, so a press waits for the real buttons and is never lost.
        <div className="flex items-center gap-2" inert={onEditing === undefined}>
          <Button
            variant="outline"
            size="lg"
            className="max-lg:h-10"
            onClick={() => onEditing?.(true)}
          >
            <Settings2Icon />
            {t("customize")}
          </Button>
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
      )}
    </div>
  )
}

// The dashboard before its page arrives: the greeting and actions, which the shell can already
// draw. The widgets follow with the layout the account chose, each behind its own placeholder.
export function DashboardLoading() {
  const viewer = useViewer()
  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <DashboardHeader firstName={firstName(viewer.name)} />
    </div>
  )
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
