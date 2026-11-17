"use client"

import { Skeleton } from "@sniptide/ui/components/skeleton"
import { useTranslations } from "next-intl"
import { PageHeader } from "@/components/page-header"

// The catalog before its templates arrive: the title and intro as they are, the filter and search
// as blocks of their size, and cards shaped like template cards.
export function TemplateCatalogLoading() {
  const t = useTranslations("Workspace")
  return (
    <div className="flex flex-col gap-5 p-4 lg:gap-6 lg:p-7">
      <PageHeader title={t("paste_templates")} description={t("templates_intro")} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-11 w-full rounded-lg lg:h-9 lg:w-96" />
          <Skeleton className="h-[46px] w-full rounded-lg lg:h-8 lg:w-65" />
        </div>
        <div className="@container">
          <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
            {[56, 72, 64, 48, 68, 60].map((width) => (
              <li
                key={width}
                className="flex h-[348px] flex-col overflow-hidden rounded-lg border border-border"
              >
                <div className="flex h-44 items-center justify-center border-b border-border bg-sidebar">
                  <Skeleton className="h-14 w-36 rounded-lg" />
                </div>
                <div className="flex flex-col gap-2.5 px-5 pt-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6" style={{ width: `${width}%` }} />
                  <Skeleton className="h-4 w-[90%]" />
                  <Skeleton className="h-4 w-[70%]" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
