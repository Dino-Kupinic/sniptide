"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { DownloadIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useCommandMenu } from "@/components/command-menu/command-menu"

// New paste and Import gist as two tiles above the widgets on phones, in place of the header's
// buttons.
export function PhoneHomeTiles() {
  const t = useTranslations("Workspace")
  const { importGist } = useCommandMenu()
  const tileClass =
    "flex h-[76px] flex-col justify-between rounded-lg p-3.5 text-left text-base leading-5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:opacity-80"
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:hidden">
      <Link href="/new" className={cn(tileClass, "bg-primary text-primary-foreground")}>
        <PlusIcon aria-hidden className="size-5" strokeWidth={2} />
        {t("new_paste")}
      </Link>
      <button
        type="button"
        onClick={() => importGist?.()}
        className={cn(tileClass, "border border-border bg-card")}
      >
        <DownloadIcon aria-hidden className="size-5 text-link" strokeWidth={2} />
        {t("import_gist")}
      </button>
    </div>
  )
}
