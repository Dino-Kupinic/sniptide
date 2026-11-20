"use client"

import { Skeleton } from "@sniptide/ui/components/skeleton"
import { cn } from "@sniptide/ui/lib/utils"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { GroupedCanvas, groupedPanelClass } from "@/components/lists/grouped-list"
import { PageHeader } from "@/components/page-header"
import { useSettledShellData } from "@/components/shell/shell-data"

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

// The side panel's single-line rows. `open` is the height in pixels of the content under the first
// row, which the editor's panel opens by default.
function PanelRows({ rows, first, open }: { rows: number; first?: string; open?: number }) {
  return (
    <div
      aria-hidden="true"
      className="hidden w-[272px] shrink-0 flex-col divide-y divide-border overflow-hidden rounded-lg border border-border lg:flex xl:w-[300px]"
    >
      {Array.from({ length: rows }, (_, row) => (
        <React.Fragment key={row}>
          <div className={cn("flex h-11 items-start gap-2.5 px-3 pt-3.5", row === 0 && first)}>
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="h-4 w-28" />
          </div>
          {row === 0 && open ? (
            <div className="flex flex-col gap-3 px-3 pt-1" style={{ height: open }}>
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="mt-3 h-3.5 w-20" />
              <Skeleton className="mt-auto mb-4 h-6 w-full" />
            </div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  )
}

// The action bar below a paste on phones.
function PhoneBars() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-20 box-content flex h-14 items-center gap-2 border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden"
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
      <PhoneTopBar />
      <div className="flex min-w-0 flex-col gap-1.5 px-4 lg:px-0">
        {known ? (
          <h1 className="min-w-0 [overflow-wrap:anywhere] font-heading text-2xl leading-8 font-bold tracking-[-0.02em]">
            {known.title}
          </h1>
        ) : (
          <div aria-hidden="true" className="flex h-8 items-center">
            <Skeleton className="h-5.5 w-72 max-w-full" />
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

// The editor before the paste or the account's defaults arrive. Phones get the editor's own
// layout: its bar, the title and code on one card, the settings panel and the action bar.
export function EditorLoading({ editing = false }: { editing?: boolean }) {
  return (
    <>
      <PhoneEditorLoading />
      <div className="flex flex-col max-lg:hidden lg:gap-5 lg:p-7">
        <div aria-hidden="true" className="flex min-w-0 flex-col gap-1.5">
          <div className="flex h-[38px] items-center">
            <Skeleton className="h-7 w-64 max-w-full" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <div aria-hidden="true" className="flex flex-1 flex-row items-start gap-5">
          <div className="flex min-h-[548px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
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
          <PanelRows rows={4} open={editing ? 226 : 204} />
        </div>
      </div>
    </>
  )
}

function PhoneEditorLoading() {
  return (
    <div aria-hidden="true" className="flex min-h-svh flex-col lg:hidden">
      <GroupedCanvas />
      <div className="sticky top-0 z-20 box-content flex h-[52px] items-center justify-between bar-translucent pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-14" />
      </div>
      <div className="mx-4 mt-2 flex flex-col gap-2 rounded-t-lg border-b border-border bg-card px-4 py-3.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="mx-4 flex min-h-[340px] flex-col overflow-hidden rounded-b-lg bg-card">
        <div className="flex h-10 items-center gap-2 border-b border-border px-4">
          <Skeleton className="size-4" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <div className="flex-1 p-4">
          <CodeLines lines={3} />
        </div>
        <div className="flex h-10 items-center justify-between border-t border-border px-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className={cn(groupedPanelClass, "mx-4 mt-7")}>
        {["w-20", "w-16", "w-24", "w-20"].map((width) => (
          <div
            key={width}
            className="flex h-[50px] items-center justify-between px-4 not-last:border-b not-last:border-border"
          >
            <Skeleton className={cn("h-4", width)} />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 z-20 mt-auto box-content flex h-14 items-center border-t border-border bg-background pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))]">
        <Skeleton className="h-10 flex-1 rounded-lg" />
      </div>
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
      <PageHeader
        title={t("analytics")}
        actions={
          <div aria-hidden="true" className="flex w-full flex-col gap-2 lg:flex-row">
            <Skeleton className="h-10 rounded-lg lg:h-9 lg:w-28" />
            <Skeleton className="h-10 rounded-lg lg:h-9 lg:w-64" />
            <Skeleton className="h-9 w-28 rounded-lg max-lg:hidden" />
          </div>
        }
        className="lg:items-end [&>div:first-child]:lg:after:block [&>div:first-child]:lg:after:h-5 [&>div:first-child]:lg:after:content-['']"
        phoneTitleOnly
      />
      <PhoneAnalyticsLoading />
      <div
        aria-hidden="true"
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-border max-lg:hidden lg:grid-cols-4"
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

// The phone's analytics: the range switch, the views card with its chart and the totals.
function PhoneAnalyticsLoading() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-7 lg:hidden">
      <GroupedCanvas />
      <Skeleton className="-mt-2 h-[34px] rounded-lg" />
      <div className={cn(groupedPanelClass, "gap-3 p-4")}>
        <Skeleton className="h-3.5 w-12" />
        <div className="flex h-[41px] items-center">
          <Skeleton className="h-7 w-16" />
        </div>
        <Skeleton className="h-28" />
      </div>
      <div className={groupedPanelClass}>
        {["w-32", "w-28", "w-36"].map((width) => (
          <div
            key={width}
            className="flex h-[50px] items-center justify-between pr-4 pl-4 not-last:border-b not-last:border-border"
          >
            <Skeleton className={cn("h-4", width)} />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  )
}

// A screen with no placeholder of its own: the shell stays, and the screen appears when ready.
export function BlankLoading() {
  return null
}
