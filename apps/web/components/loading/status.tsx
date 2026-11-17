"use client"

import { useTranslations } from "next-intl"

// Tells assistive technology that a screen is loading. The placeholders around it are hidden
// from it, so this is the one thing it reads.
export function LoadingStatus() {
  const t = useTranslations("Workspace")
  return (
    <span role="status" className="sr-only">
      {t("loading")}
    </span>
  )
}
