"use client"

import { Skeleton } from "@sniptide/ui/components/skeleton"
import { cn } from "@sniptide/ui/lib/utils"
import { useTranslations } from "next-intl"
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
                className="flex flex-col gap-1.5 border-border px-4 py-4 lg:px-5 [&:not(:last-child)]:border-b @min-[24rem]:[&:nth-child(odd)]:border-r @min-[24rem]:[&:nth-last-child(-n+2)]:border-b-0 @min-[48rem]:[&:not(:last-child)]:border-r @min-[48rem]:[&:not(:last-child)]:border-b-0"
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
