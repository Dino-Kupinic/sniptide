"use client"

import { Button } from "@sniptide/ui/components/button"
import { CheckIcon, CopyIcon } from "lucide-react"
import * as React from "react"

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), timeout)
    },
    [timeout],
  )

  return { copied, copy }
}

// Tells the server a visitor copied a paste's code, for the Analytics page. A beacon, so a failed
// or slow report never gets in the way of the copy.
export function reportCopy(slug: string) {
  navigator.sendBeacon?.(`/${encodeURIComponent(slug)}/copy`)
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  icon = true,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> & {
  text: string
  label?: string
  copiedLabel?: string
  icon?: boolean
}) {
  const { copied, copy } = useCopy()

  return (
    <Button type="button" onClick={() => copy(text)} {...props}>
      {icon ? copied ? <CheckIcon /> : <CopyIcon /> : null}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  )
}
