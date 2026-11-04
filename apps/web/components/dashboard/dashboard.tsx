"use client"

import { Button } from "@sniptide/ui/components/button"
import { CheckIcon, PlusIcon, Settings2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { ImportGistButton } from "@/components/lists/import-gist"
import { NavigationLink as Link } from "@/components/navigation-link"
import type { ConnectedAgent } from "@/lib/agents"
import { track } from "@/lib/analytics"
import type { WidgetId } from "@/lib/dashboard/widgets"
import type { DashboardData } from "@/lib/pastes/dashboard"
import { AddWidgetMenu, TemplateMenu, useDashboardLayout, WidgetBoard } from "./widget-board"
import { type DashboardSource, useDashboardData } from "./widgets"

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

// The signed-in home: what needs attention and the widgets the person chose, starting from the
// Agents template. Figures and charts live on /analytics.
export function Dashboard({
  data,
  layout,
  agents,
  firstName,
  origin,
  appOrigin,
}: {
  data: DashboardData | Promise<DashboardData>
  layout: WidgetId[]
  agents: ConnectedAgent[]
  firstName: string
  // The share-link origin for row links, and the app's own origin for the MCP server address.
  origin: string
  appOrigin: string
}) {
  const t = useTranslations("Workspace")
  const dashboard = useDashboardLayout(layout)
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
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Greeting firstName={firstName} />
          <React.Suspense fallback={null}>
            <AttentionLine data={data} />
          </React.Suspense>
        </div>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <AddWidgetMenu dashboard={dashboard} />
            <TemplateMenu dashboard={dashboard} />
            <Button size="lg" className="max-lg:h-10" onClick={() => setEditing(false)}>
              <CheckIcon />
              {t("done")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              className="max-lg:h-10"
              onClick={() => setEditing(true)}
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
