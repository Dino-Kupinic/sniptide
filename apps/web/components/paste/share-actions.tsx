"use client"

import { Button } from "@sniptide/ui/components/button"
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react"
import { useCopy } from "./copy-button"

// Raw / Download / Copy code on the public page, for the paste's first file.
export function ShareActions({
  rawHref,
  content,
  compact = false,
}: {
  rawHref?: string
  content: string
  compact?: boolean
}) {
  const { copied, copy } = useCopy()

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
        <Button className="h-12 flex-1 gap-2 text-base font-semibold" onClick={() => copy(content)}>
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
      <Button size="lg" onClick={() => copy(content)}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span aria-live="polite">{copied ? "Copied" : "Copy code"}</span>
      </Button>
    </div>
  )
}
