"use client"

import { Button } from "@sniptide/ui/components/button"
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react"
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
  const { copied, copy } = useCopy()
  const copyCode = async () => {
    await copy(content)
    if (slug) reportCopy(slug)
  }

  if (compact) {
    return (
      <div className="flex gap-2">
        {rawHref ? (
          <Button
            variant="outline"
            className="h-12 px-4 text-base"
            render={<a href={rawHref} />}
            nativeButton={false}
          >
            Raw
          </Button>
        ) : null}
        <Button className="h-12 flex-1 gap-2 text-base font-semibold" onClick={copyCode}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span aria-live="polite">{copied ? "Copied" : "Copy code"}</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {rawHref ? (
        <>
          <Button variant="outline" size="lg" render={<a href={rawHref} />} nativeButton={false}>
            Raw
          </Button>
          <Button
            variant="outline"
            size="lg"
            render={<a href={`${rawHref}&download=1`} />}
            nativeButton={false}
          >
            <DownloadIcon />
            Download
          </Button>
        </>
      ) : null}
      <Button size="lg" onClick={copyCode}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span aria-live="polite">{copied ? "Copied" : "Copy code"}</span>
      </Button>
    </div>
  )
}
