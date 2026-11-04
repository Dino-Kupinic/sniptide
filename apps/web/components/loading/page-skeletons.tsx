"use client"

import { Skeleton } from "@sniptide/ui/components/skeleton"
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
