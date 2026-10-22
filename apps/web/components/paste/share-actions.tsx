"use client"

import { Button } from "@sniptide/ui/components/button"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { CopyIcon, DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { reportCopy, useCopy } from "./copy-button"
import { useActiveFile } from "./file-viewer"

// Raw / Download / Copy code on the public page, for the paste's first file. The compact row for
// phones follows the file open in the code card when an ActiveFileProvider wraps the page.
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
  const active = useActiveFile()
  const copyCode = async () => {
    if ((await copy(compact && active ? active.content : content)) && slug) reportCopy(slug)
  }

  if (compact) {
    const href =
      rawHref && active && slug ? `/${slug}/raw?file=${encodeURIComponent(active.name)}` : rawHref
    return (
      <div className="flex gap-2">
        {href ? (
          <>
            <Button variant="outline" size="xl" render={<a href={href} />} nativeButton={false}>
              {t("raw")}
            </Button>
            <Button
              variant="outline"
              size="xl"
              aria-label={t("downloadFile", { name: active?.name ?? "" })}
              className="px-3"
              render={<a href={`${href}&download=1`} />}
              nativeButton={false}
            >
              <DownloadIcon />
            </Button>
          </>
        ) : null}
        <Button size="xl" className="min-w-0 flex-1" onClick={copyCode}>
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
