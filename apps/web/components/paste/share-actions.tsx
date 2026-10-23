"use client"

import { Button } from "@sniptide/ui/components/button"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { CopyIcon, DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { reportCopy, useCopy } from "./copy-button"

// Raw / Download / Copy code on the public page, for the paste's first file.
export function ShareActions({
  slug,
  rawHref,
  content,
  compact = false,
}: {
  // Without one the copy isn't reported, as on a burn-after-read paste that is already gone.
  slug?: string
  rawHref?: string
  content: string
  compact?: boolean
}) {
  const t = useTranslations("Paste")
  const { copied, copy } = useCopy()
  const copyCode = async () => {
    if ((await copy(content)) && slug) reportCopy(slug)
  }

  if (compact) {
    return (
      <div className="flex gap-2">
        {rawHref ? (
          <Button
            variant="outline"
            className="h-[46px] px-4 text-base"
            render={<a href={rawHref} />}
            nativeButton={false}
          >
            {t("raw")}
          </Button>
        ) : null}
        <Button className="h-[46px] flex-1 gap-2 text-base font-semibold" onClick={copyCode}>
          {copied ? <SuccessCheck /> : <CopyIcon />}
          <span aria-live="polite">{copied ? t("copied") : t("copyCode")}</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {rawHref ? (
        <>
          <Button variant="outline" size="lg" render={<a href={rawHref} />} nativeButton={false}>
            {t("raw")}
          </Button>
          <Button
            variant="outline"
            size="lg"
            render={<a href={`${rawHref}&download=1`} />}
            nativeButton={false}
          >
            <DownloadIcon />
            {t("download")}
          </Button>
        </>
      ) : null}
      <Button size="lg" onClick={copyCode}>
        {copied ? <SuccessCheck /> : <CopyIcon />}
        <span aria-live="polite">{copied ? t("copied") : t("copyCode")}</span>
      </Button>
    </div>
  )
}
