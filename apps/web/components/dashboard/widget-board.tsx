"use client"

import { arrayMove } from "@dnd-kit/helpers"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { cn } from "@sniptide/ui/lib/utils"
import { GripVerticalIcon, LayoutTemplateIcon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { showUndo } from "@/components/undo-toast"
import type { ConnectedAgent } from "@/lib/agents"
import { track } from "@/lib/analytics"
import { saveDashboardLayout } from "@/lib/dashboard/actions"
import {
  TEMPLATE_IDS,
  TEMPLATES,
  type TemplateId,
  WIDE_WIDGETS,
  WIDGETS,
  type WidgetId,
} from "@/lib/dashboard/widgets"
import { runAction } from "@/lib/feedback"
import { AgentArea } from "./agent-area"
import { type DashboardSource, DataWidget, useWidgetName, WidgetFallback } from "./widgets"

// The layout on screen, saved after every change. Removing a widget or switching templates can be
// taken back from the toast.
export function useDashboardLayout(initial: WidgetId[]) {
  const t = useTranslations("Workspace")
  const coreT = useTranslations("Core")
  const name = useWidgetName()
  const [layout, setLayout] = React.useState(initial)
  const current = React.useRef(layout)
  current.current = layout

  const save = React.useCallback(
    async (next: WidgetId[]) => {
      const previous = current.current
      current.current = next
      setLayout(next)
      const result = await runAction(() => saveDashboardLayout(next), {
        error: t("couldnt_save_the_dashboard"),
      })
      if (!result.ok) {
        current.current = previous
        setLayout(previous)
      }
      return { ok: result.ok, previous }
    },
    [t],
  )

  const undoable = React.useCallback(
    async (next: WidgetId[], message: string) => {
      const { ok, previous } = await save(next)
      if (!ok) return
      showUndo({
        message,
        labels: { undo: coreT("undo"), error: coreT("undoError") },
        undo: () => saveDashboardLayout(previous),
        onUndone: () => {
          current.current = previous
          setLayout(previous)
        },
      })
    },
    [save, coreT],
  )

  return {
    layout,
    add(widget: WidgetId) {
      track("dashboard_widget_added", { widget })
      void save([...current.current, widget])
    },
    remove(widget: WidgetId) {
      track("dashboard_widget_removed", { widget })
      void undoable(
        current.current.filter((id) => id !== widget),
        t("widget_removed_named", { name: name(widget) }),
      )
    },
    move(from: number, to: number) {
      track("dashboard_widgets_reordered")
      void save(arrayMove(current.current, from, to))
    },
    applyTemplate(template: TemplateId) {
      track("dashboard_template_applied", { template })
      void undoable(
        [...TEMPLATES[template]],
        t("template_applied", { name: t(`template_${template}`) }),
      )
    },
  }
}

export type DashboardLayout = ReturnType<typeof useDashboardLayout>

// The Customize bar's menus, also offered by an empty dashboard.
export function AddWidgetMenu({
  dashboard,
  variant = "outline",
}: {
  dashboard: DashboardLayout
  variant?: "outline" | "default"
}) {
  const t = useTranslations("Workspace")
  const name = useWidgetName()
  const missing = WIDGETS.filter((widget) => !dashboard.layout.includes(widget))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={variant} size="lg" className="max-lg:h-10" />}
        disabled={missing.length === 0}
      >
        <PlusIcon />
        {t("add_widget")}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {missing.map((widget) => (
          <DropdownMenuItem
            key={widget}
            className="max-lg:h-10"
            onClick={() => dashboard.add(widget)}
          >
            {name(widget)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TemplateMenu({ dashboard }: { dashboard: DashboardLayout }) {
  const t = useTranslations("Workspace")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="lg" className="max-lg:h-10" />}>
        <LayoutTemplateIcon />
        {t("templates")}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {TEMPLATE_IDS.map((template) => (
          <DropdownMenuItem
            key={template}
            className="max-lg:h-10"
            onClick={() => dashboard.applyTemplate(template)}
          >
            {t(`template_${template}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The widgets in two columns on desktop and one on phones. While customizing, each widget gets a
// bar with a drag handle and a remove button above it.
export function WidgetBoard({
  dashboard,
  editing,
  data,
  agents,
  origin,
  appOrigin,
}: {
  dashboard: DashboardLayout
  editing: boolean
  data: DashboardSource
  agents: ConnectedAgent[]
  origin: string
  appOrigin: string
}) {
  const t = useTranslations("Workspace")
  const { layout } = dashboard

  if (layout.length === 0)
    return (
      <section className="flex flex-col items-start gap-4 rounded-lg border border-border p-4 lg:p-5">
        <p className="text-sm leading-5 text-muted-foreground">{t("dashboard_blank")}</p>
        <div className="flex flex-wrap gap-2">
          <AddWidgetMenu dashboard={dashboard} variant="default" />
          {(["agents", "sharing", "secrets"] as const).map((template) => (
            <Button
              key={template}
              variant="outline"
              size="lg"
              className="max-lg:h-10"
              onClick={() => dashboard.applyTemplate(template)}
            >
              {t(`template_${template}`)}
            </Button>
          ))}
        </div>
      </section>
    )

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return
        const { source } = event.operation
        if (!isSortable(source) || source.initialIndex === source.index) return
        dashboard.move(source.initialIndex, source.index)
      }}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        {layout.map((widget, index) => (
          <SortableWidget
            key={widget}
            widget={widget}
            index={index}
            editing={editing}
            onRemove={() => dashboard.remove(widget)}
          >
            {widget === "agents" ? (
              <AgentArea
                agents={agents}
                origin={appOrigin}
                onRemove={editing ? undefined : () => dashboard.remove("agents")}
              />
            ) : (
              <React.Suspense fallback={<WidgetFallback id={widget} />}>
                <DataWidget id={widget} data={data} origin={origin} />
              </React.Suspense>
            )}
          </SortableWidget>
        ))}
      </div>
    </DragDropProvider>
  )
}

function SortableWidget({
  widget,
  index,
  editing,
  onRemove,
  children,
}: {
  widget: WidgetId
  index: number
  editing: boolean
  onRemove: () => void
  children: React.ReactNode
}) {
  const t = useTranslations("Workspace")
  const name = useWidgetName()(widget)
  const { ref, handleRef, isDragSource } = useSortable({
    id: widget,
    index,
    disabled: !editing,
  })
  return (
    <div
      ref={ref}
      data-widget={widget}
      className={cn(
        "flex min-w-0 flex-col gap-2",
        WIDE_WIDGETS.has(widget) && "lg:col-span-2",
        isDragSource && "relative z-20 rounded-lg bg-background shadow-(--float-shadow)",
      )}
    >
      {/* The bar stays mounted so the handle is always the drag activator, and only shows while
          customizing. */}
      <div
        hidden={!editing}
        className="flex h-10 items-center gap-1 rounded-lg bg-muted pr-1 pl-1 lg:h-9"
      >
        <button
          ref={handleRef}
          type="button"
          aria-label={t("widget_move_named", { name })}
          className="flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing lg:size-7"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("widget_remove_named", { name })}
          className="max-lg:size-10"
          onClick={onRemove}
        >
          <XIcon />
        </Button>
      </div>
      {children}
    </div>
  )
}
