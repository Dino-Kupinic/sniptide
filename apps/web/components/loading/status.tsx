"use client"

import { useTranslations } from "next-intl"

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

// Wraps a route's loading state. Its controls look like the screen's own, but the screen
// replaces them when it arrives, and focus or a value given to them would go with them. So the
// loading state is inert, and a press or a key waits for the real control.
export function LoadingScreen({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LoadingStatus />
      <div data-slot="loading" className="contents" inert>
        {children}
      </div>
    </>
  )
}
