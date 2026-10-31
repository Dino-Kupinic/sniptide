"use client"

import { Skeleton } from "@sniptide/ui/components/skeleton"
import { cn } from "@sniptide/ui/lib/utils"
import { useTranslations } from "next-intl"
import { PageHeader } from "@/components/page-header"
import { ListRowsSkeleton } from "./list-skeletons"
import { LoadingRegion } from "./region"

export function CodeSkeleton({ lines = 9 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2.5 overflow-hidden rounded-lg border border-border bg-sidebar p-4">
      <div className="mb-2 flex h-8 items-center gap-2 border-b border-border pb-3">
        <Skeleton className="size-4" />
        <Skeleton className="h-3 w-28" />
      </div>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="flex items-center gap-[18px]">
          <Skeleton className="h-3 w-4 shrink-0" />
          <Skeleton className="h-3" style={{ width: `${[65, 45, 80, 55, 35][index % 5]}%` }} />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ className }: { className?: string }) {
  const t = useTranslations("Workspace")
  return (
    <LoadingRegion
      className={cn("rounded-lg border border-border p-4 lg:p-5", className)}
      label={t("loading")}
    >
      <Skeleton className="h-4 w-24" />
      <div className="mt-5 flex h-44 items-end gap-2 border-b border-l border-border px-3 pb-2 sm:h-52">
        {[40, 65, 50, 85, 60, 75, 95].map((height, index) => (
          <Skeleton key={index} className="flex-1 rounded-sm" style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="mt-3 flex justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
    </LoadingRegion>
  )
}

export function StatsSkeleton() {
  const t = useTranslations("Workspace")
  return (
    <LoadingRegion>
      <div className="@container overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-1 @min-[24rem]:grid-cols-2 @min-[48rem]:grid-cols-4">
          {[t("total_pastes"), t("views"), t("active_share_links"), t("expiring_in_48h")].map(
            (label) => (
              <div
                key={label}
                className="flex flex-col gap-2 border-border px-4 py-4 lg:px-5 [&:not(:last-child)]:border-b @min-[24rem]:[&:nth-child(odd)]:border-r @min-[24rem]:[&:nth-last-child(-n+2)]:border-b-0 @min-[48rem]:[&:not(:last-child)]:border-r @min-[48rem]:[&:not(:last-child)]:border-b-0"
              >
                <span className="text-[13px] text-muted-foreground">{label}</span>
                <Skeleton className="h-9 w-20" />
              </div>
            ),
          )}
        </div>
      </div>
    </LoadingRegion>
  )
}

export function DashboardSkeleton() {
  const t = useTranslations("Core")
  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <PageHeader title={t("dashboard")} />
      <StatsSkeleton />
      <div className="flex flex-col gap-5 lg:flex-row">
        <LoadingRegion className="hidden min-w-0 flex-[1.8] lg:block">
          <CodeSkeleton />
        </LoadingRegion>
        <ChartSkeleton className="min-w-0 flex-1" />
      </div>
      <ListRowsSkeleton compact />
    </div>
  )
}

export function AnalyticsSkeleton() {
  const t = useTranslations("Core")
  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <PageHeader title={t("analytics")} />
      <AnalyticsReportSkeleton />
    </div>
  )
}

export function AnalyticsReportSkeleton() {
  return (
    <>
      <LoadingRegion>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex flex-col gap-3 border-border p-4 lg:p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          ))}
        </div>
      </LoadingRegion>
      <ChartSkeleton />
      <div className="grid gap-5 lg:grid-cols-[705fr_393fr] lg:gap-6">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        <PanelSkeleton />
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </>
  )
}

function PanelSkeleton() {
  return (
    <LoadingRegion className="rounded-lg border border-border p-4">
      <Skeleton className="mb-5 h-4 w-28" />
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-3">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </LoadingRegion>
  )
}

export function PasteDetailSkeleton({ editing = false }: { editing?: boolean }) {
  const t = useTranslations("Core")
  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      {editing ? (
        <PageHeader title={t("edit")} />
      ) : (
        <LoadingRegion>
          <Skeleton className="h-9 w-2/3 max-w-96" />
          <Skeleton className="mt-3 h-4 w-44" />
        </LoadingRegion>
      )}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <LoadingRegion>
          <CodeSkeleton lines={editing ? 15 : 12} />
        </LoadingRegion>
        <div className="flex flex-col gap-5">
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      </div>
    </div>
  )
}

export function EditorSkeleton() {
  const t = useTranslations("Core")
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-7">
      <PageHeader title={t("new")} />
      <LoadingRegion>
        <Skeleton className="h-11 w-full max-w-lg" />
        <div className="mt-5">
          <CodeSkeleton lines={15} />
        </div>
      </LoadingRegion>
    </div>
  )
}

export function SettingsSkeleton() {
  const t = useTranslations("Core")
  const s = useTranslations("Settings")
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-7">
      <PageHeader title={t("settings")} />
      <LoadingRegion>
        <div className="flex flex-col divide-y divide-border lg:flex-row lg:gap-6 lg:divide-y-0">
          {[
            s("general"),
            s("account"),
            s("pasteDefaults"),
            s("notifications"),
            s("apiTokens"),
            s("usage"),
            s("billing"),
          ].map((label) => (
            <div key={label} className="flex items-center justify-between py-4 text-sm lg:py-0">
              <span>{label}</span>
              <Skeleton className="ml-4 size-4 lg:hidden" />
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-10 border-b border-border py-7">
              <Skeleton className="h-5 w-72 shrink-0" />
              <div className="flex w-full max-w-[560px] flex-col gap-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      </LoadingRegion>
    </div>
  )
}

export function SecretDetailSkeleton() {
  const t = useTranslations("Secrets")
  return (
    <div className="ph-no-capture flex flex-col gap-5 p-4 lg:p-7">
      <PageHeader title={t("title")} />
      <LoadingRegion>
        <Skeleton className="mb-5 h-5 w-44" />
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="flex min-h-16 flex-wrap items-center gap-4 p-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="ml-auto size-8" />
            </div>
          ))}
        </div>
      </LoadingRegion>
      <PanelSkeleton />
    </div>
  )
}

export function RevisionSkeleton() {
  return (
    <LoadingRegion>
      <div className="mb-4 flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
      <CodeSkeleton lines={8} />
    </LoadingRegion>
  )
}
