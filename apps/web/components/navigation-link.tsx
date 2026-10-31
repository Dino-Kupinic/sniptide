"use client"

import Link, { useLinkStatus } from "next/link"
import { useTranslations } from "next-intl"
import type { ComponentProps } from "react"
import { createPortal } from "react-dom"

// Without a route-wide fallback, Next keeps the current screen until the destination is
// ready. A delayed, fixed indicator acknowledges a slow click without moving the page.
export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <NavigationFeedback />
    </Link>
  )
}

function NavigationFeedback() {
  const { pending } = useLinkStatus()
  const t = useTranslations("Workspace")
  if (!pending) return null
  return createPortal(
    <div
      role="status"
      className="navigation-feedback pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-pink"
    >
      <span className="sr-only">{t("loading")}</span>
    </div>,
    document.body,
  )
}
