"use client"

import { Button } from "@sniptide/ui/components/button"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { toast } from "@sniptide/ui/components/toast"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"

// Copies to the clipboard and flips `copied` for a moment so the button can show the check. A
// refused clipboard (no permission, an insecure origin) says so in a toast; `copy` resolves to
// whether it worked.
export function useCopy(timeout = 1600) {
  const t = useTranslations("Paste")
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  const copy = React.useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        toast.error(t("couldnTCopyAllowClipboardAccess"))
        return false
      }
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), timeout)
      return true
    },
    [timeout, t],
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
  label,
  copiedLabel,
  icon = true,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> & {
  text: string
  label?: string
  copiedLabel?: string
  icon?: boolean
}) {
  const t = useTranslations("Paste")
  const { copied, copy } = useCopy()

  return (
    <Button type="button" onClick={() => copy(text)} {...props}>
      {icon ? copied ? <SuccessCheck /> : <CopyIcon /> : null}
      <span aria-live="polite">{copied ? (copiedLabel ?? t("copied")) : (label ?? t("copy"))}</span>
    </Button>
  )
}
