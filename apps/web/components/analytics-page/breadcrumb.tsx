"use client"

import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { HeaderTitle } from "@/components/shell/page-header"

// "Workspace > Analytics" in the desktop top bar, in place of the plain route title.
export function AnalyticsBreadcrumb() {
  const t = useTranslations("Workspace")
  return (
    <HeaderTitle>
      <nav aria-label={t("breadcrumb")} className="flex items-center gap-1.5 text-sm font-normal">
        <Link
          href="/dashboard"
          className="text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
        >
          {t("workspace")}
        </Link>
        <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <span aria-current="page">{t("analytics")}</span>
      </nav>
    </HeaderTitle>
  )
}
