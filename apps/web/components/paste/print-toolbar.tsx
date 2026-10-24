"use client"

import { Button } from "@sniptide/ui/components/button"
import { ChevronLeftIcon, PrinterIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"

// Above the print view on screen only. Opens the print dialog once the page has loaded, and keeps
// a button for printing again after the dialog was dismissed.
export function PrintToolbar({ backHref }: { backHref: string }) {
  const t = useTranslations("Paste")

  React.useEffect(() => {
    // After fonts load, so the first print uses Archivo and JetBrains Mono.
    let cancelled = false
    document.fonts.ready.then(() => {
      if (!cancelled) window.print()
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex items-center justify-between gap-3 print:hidden">
      <a
        href={backHref}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        {t("backToPaste")}
      </a>
      <Button onClick={() => window.print()}>
        <PrinterIcon />
        {t("print")}
      </Button>
    </div>
  )
}
