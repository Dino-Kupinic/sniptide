"use client"

import { useTranslations } from "next-intl"
import * as React from "react"

// Tells assistive technology that a screen is loading. The placeholders around it are hidden
// from it, so this is the one thing it reads.
function LoadingStatus() {
  const t = useTranslations("Workspace")
  return (
    <span role="status" className="sr-only">
      {t("loading")}
    </span>
  )
}

const subscribe = () => () => {}

// Wraps a route's loading state. On a fresh request it is plain HTML that React has not attached
// to yet, so a press there would be lost: that HTML is inert, and the press waits for the screen.
// On a navigation inside the app the browser renders it, and its controls work at once.
export function LoadingScreen({ children }: { children: React.ReactNode }) {
  const inert = React.useSyncExternalStore(
    subscribe,
    () => false,
    () => true,
  )
  return (
    <>
      <LoadingStatus />
      <div className="contents" inert={inert}>
        {children}
      </div>
    </>
  )
}
