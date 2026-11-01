"use client"

import { Button } from "@sniptide/ui/components/button"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { toast } from "@sniptide/ui/components/toast"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
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

export type LinkCopyState = "idle" | "copied" | "open"

// Copies a link, and once "Copied" has shown, offers "Open" while the pointer is still on the
// button: the next click opens the link in a new tab. Leaving the button resets it to "Copy".
// Touch pointers never count as hovering, so a tap always copies.
export function useCopyLink(url: string, onCopy?: () => void, timeout = 1600) {
  const t = useTranslations("Paste")
  const [state, setState] = React.useState<LinkCopyState>("idle")
  const hovered = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  async function onClick() {
    if (state === "open") {
      window.open(url, "_blank", "noopener,noreferrer")
      setState("idle")
      return
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      toast.error(t("couldnTCopyAllowClipboardAccess"))
      return
    }
    onCopy?.()
    setState("copied")
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState(hovered.current ? "open" : "idle"), timeout)
  }

  // Enter alone misses a button that renders under a resting pointer, so a move or press counts too.
  const onPointerOver = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") hovered.current = true
  }

  const props = {
    onClick,
    onPointerEnter: onPointerOver,
    onPointerMove: onPointerOver,
    onPointerDown: onPointerOver,
    onPointerLeave: () => {
      hovered.current = false
      setState((current) => (current === "open" ? "idle" : current))
    },
  }

  return { state, copied: state === "copied", props }
}

// The icon and label for a link copy button in each state, every label reserving its space.
export function LinkCopyContent({
  state,
  label,
  icon,
}: {
  state: LinkCopyState
  label: string
  icon?: React.ReactNode
}) {
  const t = useTranslations("Paste")
  const labels: [LinkCopyState, string][] = [
    ["idle", label],
    ["copied", t("copied")],
    ["open", t("open")],
  ]
  return (
    <>
      {state === "copied" ? <SuccessCheck /> : state === "open" ? <ExternalLinkIcon /> : icon}
      <span className="inline-grid" aria-live="polite">
        {labels.map(([key, text]) => (
          <span
            key={key}
            className="col-start-1 row-start-1"
            style={{ visibility: state === key ? "visible" : "hidden" }}
            aria-hidden={state !== key}
          >
            {text}
          </span>
        ))}
      </span>
    </>
  )
}

// Both labels reserve space, so copy feedback never shifts nearby actions.
export function CopyFeedbackLabel({
  copied,
  label,
  copiedLabel,
}: {
  copied: boolean
  label: string
  copiedLabel: string
}) {
  return (
    <span className="inline-grid" aria-live="polite">
      <span
        className="col-start-1 row-start-1"
        style={{ visibility: copied ? "hidden" : "visible" }}
        aria-hidden={copied}
      >
        {label}
      </span>
      <span
        className="col-start-1 row-start-1"
        style={{ visibility: copied ? "visible" : "hidden" }}
        aria-hidden={!copied}
      >
        {copiedLabel}
      </span>
    </span>
  )
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
      <CopyFeedbackLabel
        copied={copied}
        label={label ?? t("copy")}
        copiedLabel={copiedLabel ?? t("copied")}
      />
    </Button>
  )
}
