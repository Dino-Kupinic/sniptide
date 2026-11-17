"use client"

import { Skeleton } from "@sniptide/ui/components/skeleton"
import { cn } from "@sniptide/ui/lib/utils"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { PageHeader } from "@/components/page-header"
import { useSettledShellData } from "@/components/shell/shell-data"
import { LoadingStatus } from "./status"

// Placeholders for the screens that are one composed view instead of a list. Each keeps the
// wrappers and sizes of the screen it stands in for, so the loaded screen lands in place.

const lineWidths = [62, 38, 74, 51, 29, 68, 44, 57]

// Lines of code at the viewer's line height.
function CodeLines({ lines }: { lines: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: lines }, (_, line) => (
        <div key={line} className="flex h-[22px] items-center gap-5">
          <Skeleton className="h-3 w-4 shrink-0" />
          <Skeleton className="h-3" style={{ width: `${lineWidths[line % lineWidths.length]}%` }} />
        </div>
      ))}
    </div>
  )
}

// The side panel's single-line rows.
function PanelRows({ rows, first }: { rows: number; first?: string }) {
  return (
    <div
      aria-hidden="true"
      className="hidden w-[272px] shrink-0 flex-col divide-y divide-border overflow-hidden rounded-lg border border-border lg:flex xl:w-[300px]"
    >
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className={cn("flex h-11 items-start gap-2.5 px-3 pt-3.5", row === 0 && first)}
        >
          <Skeleton className="size-4 shrink-0" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  )
}

// The phone's bar above a paste or the editor, and the action bar below it.
function PhoneBars({ sticky = false }: { sticky?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "bottom-0 z-20 box-content flex h-14 items-center gap-2 border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden",
        sticky ? "sticky mt-6" : "fixed inset-x-0",
      )}
    >
      <Skeleton className="h-10 flex-1 rounded-lg" />
      <Skeleton className="h-10 flex-[2] rounded-lg" />
    </div>
  )
}

function PhoneTopBar() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-20 box-content flex h-[52px] items-center justify-between bg-background pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden"
    >
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

// A paste before it arrives. The sidebar's lists already name the pastes opened most, so the
// title of one of those shows at once.
export function PasteLoading() {
  const { slug } = useParams<{ slug: string }>()
  const shell = useSettledShellData()
  const known = shell
    ? [...shell.sidebar.recent, ...shell.sidebar.starred].find((paste) => paste.slug === slug)
    : undefined
  return (
    <div className="flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:gap-5 lg:p-7 lg:pb-7">
      <LoadingStatus />
      <PhoneTopBar />
      <div className="flex min-w-0 flex-col gap-1.5 px-4 lg:px-0">
        {known ? (
          <h1 className="min-w-0 [overflow-wrap:anywhere] font-heading text-[30px] leading-9 font-bold tracking-[-0.02em] lg:text-[32px] lg:leading-[38px]">
            {known.title}
          </h1>
        ) : (
          <div aria-hidden="true" className="flex h-9 items-center lg:h-[38px]">
            <Skeleton className="h-7 w-72 max-w-full" />
          </div>
        )}
        <div aria-hidden="true" className="mt-1 flex h-5 items-center gap-3">
          <Skeleton className="h-3.5 w-40 max-lg:hidden" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col gap-5 pt-4 lg:flex-row lg:items-start lg:pt-0"
      >
        <div className="mx-4 flex min-h-[380px] min-w-0 flex-col overflow-hidden rounded-lg border border-border lg:mx-0 lg:min-h-[548px] lg:flex-1">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-4">
            <Skeleton className="size-4" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="flex-1 bg-muted p-4 dark:bg-sidebar">
            <CodeLines lines={14} />
          </div>
        </div>
        <PanelRows rows={4} />
      </div>
      <PhoneBars />
    </div>
  )
}

// The editor before the paste or the account's defaults arrive.
export function EditorLoading() {
  return (
    <div className="flex min-h-svh flex-col lg:min-h-0 lg:gap-5 lg:p-7">
      <LoadingStatus />
      <PhoneTopBar />
      <div aria-hidden="true" className="flex min-w-0 flex-col gap-1.5 px-4 pb-4 lg:p-0">
        <div className="flex h-9 items-center lg:h-[38px]">
          <Skeleton className="h-7 w-64 max-w-full" />
        </div>
        <div className="flex h-6 items-center lg:h-5">
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
      <div aria-hidden="true" className="flex flex-1 flex-col gap-5 lg:flex-row lg:items-start">
        <div className="mx-4 flex min-h-[340px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border lg:mx-0 lg:min-h-[548px]">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-4">
            <Skeleton className="size-4" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="flex-1 bg-muted p-4 dark:bg-sidebar">
            <CodeLines lines={6} />
          </div>
          <div className="flex h-10 shrink-0 items-center justify-between border-t border-border px-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <PanelRows rows={4} />
      </div>
      <PhoneBars sticky />
    </div>
  )
}

function AnalyticsPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        {[70, 52, 38].map((width) => (
          <Skeleton key={width} className="h-3.5" style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  )
}

// Analytics before its report arrives: the title, then the figures, the chart and the panels at
// the sizes they take.
export function AnalyticsLoading() {
  const t = useTranslations("Core")
  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <LoadingStatus />
      <PageHeader
        title={t("analytics")}
        actions={
          <div aria-hidden="true" className="flex w-full flex-col gap-2 lg:flex-row">
            <Skeleton className="h-10 rounded-lg lg:h-9 lg:w-28" />
            <Skeleton className="h-10 rounded-lg lg:h-9 lg:w-64" />
            <Skeleton className="h-9 w-28 rounded-lg max-lg:hidden" />
          </div>
        }
        className="lg:items-end max-lg:[&>div:last-child]:w-full [&>div:first-child]:after:block [&>div:first-child]:after:h-5 [&>div:first-child]:after:content-['']"
      />
      <div
        aria-hidden="true"
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-border lg:grid-cols-4"
      >
        {["w-12", "w-24", "w-20", "w-24"].map((width, index) => (
          <div key={index} className="flex h-[92px] flex-col gap-3 px-4 pt-[18px]">
            <Skeleton className={cn("h-3.5", width)} />
            <Skeleton className="h-6 w-10" />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex h-[366px] flex-col gap-4 rounded-lg border border-border px-5 pt-5 pb-3.5 max-lg:hidden"
      >
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="mt-2 flex-1" />
      </div>
      <div
        aria-hidden="true"
        className="grid gap-5 max-lg:hidden lg:grid-cols-[705fr_393fr] lg:gap-6"
      >
        <AnalyticsPanel className="h-[207px]" />
        <AnalyticsPanel className="h-[207px]" />
      </div>
      <div aria-hidden="true" className="grid gap-5 max-lg:hidden lg:grid-cols-3 lg:gap-6">
        <AnalyticsPanel className="h-[321px]" />
        <AnalyticsPanel className="h-[321px]" />
        <AnalyticsPanel className="h-[321px]" />
      </div>
    </div>
  )
}

// A screen with no placeholder of its own: the shell stays, and the screen appears when ready.
export function BlankLoading() {
  return <LoadingStatus />
}
