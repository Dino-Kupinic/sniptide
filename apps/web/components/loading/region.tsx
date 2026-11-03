"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { useTranslations } from "next-intl"

export function LoadingRegion({
  children,
  className,
  label,
}: {
  children: React.ReactNode
  className?: string
  label?: string
}) {
  const t = useTranslations("Workspace")
  return (
    <div role="status" aria-busy="true" className={cn("min-w-0", className)}>
      <span className="sr-only">{label ?? t("loading")}</span>
      <div aria-hidden="true" className="loading-feedback">
        {children}
      </div>
    </div>
  )
}
