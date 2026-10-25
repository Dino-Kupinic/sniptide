"use client"

import * as React from "react"

// Whether a media query matches, kept in sync as it changes. The server can't know, so it renders
// `serverValue` and the browser corrects it right after hydration.
export function useMediaQuery(query: string, serverValue: boolean) {
  return React.useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", notify)
      return () => list.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  )
}

// The desktop shell (sidebar and top bar) starts at lg.
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)", true)

// Touch screens have no hover, and usually no keyboard to press shortcuts on.
export const useCanHover = () => useMediaQuery("(hover: hover)", true)
