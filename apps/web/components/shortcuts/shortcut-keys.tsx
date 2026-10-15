"use client"

import { Kbd } from "@sniptide/ui/components/kbd"
import * as React from "react"
import {
  detectMac,
  formatShortcut,
  type ShortcutId,
  shortcut,
  shortcutLabel,
} from "@/lib/shortcuts"

function subscribe() {
  return () => {}
}

// Whether to show ⌘ or Ctrl. The server can't know, so it renders Ctrl and a Mac swaps to ⌘ right
// after hydration instead of failing it.
export function useIsMac() {
  return React.useSyncExternalStore(
    subscribe,
    () => {
      const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform
      return detectMac(platform || navigator.platform)
    },
    () => false,
  )
}

// A shortcut's key caps, spelled for the viewer's platform.
export function ShortcutKeys({ id, className }: { id: ShortcutId; className?: string }) {
  const mac = useIsMac()
  return formatShortcut(shortcut(id), mac).map((label, index) => (
    <Kbd key={index} className={className}>
      {label}
    </Kbd>
  ))
}

// The same as plain text, for tooltips.
export function useShortcutLabel(id: ShortcutId) {
  const mac = useIsMac()
  return shortcutLabel(shortcut(id), mac)
}
