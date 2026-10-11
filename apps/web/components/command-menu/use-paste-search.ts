"use client"

import * as React from "react"
import type { PasteSearchResult } from "@/lib/pastes/types"

const DELAY = 120
const EMPTY: PasteSearchResult = { hits: [], total: 0 }

// Searches the viewer's pastes by title and slug as they type. Waits for a pause, drops answers
// to queries that were already replaced, and keeps the previous results on screen until the new
// ones arrive so the list doesn't flash empty between keystrokes.
export function usePasteSearch(text: string, enabled: boolean) {
  const [result, setResult] = React.useState(EMPTY)
  const [settled, setSettled] = React.useState("")
  const active = enabled && text !== ""

  React.useEffect(() => {
    if (!active) {
      setResult(EMPTY)
      setSettled("")
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(text)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(String(response.status))
        setResult((await response.json()) as PasteSearchResult)
      } catch (error) {
        if (controller.signal.aborted) return
        console.error("Command menu search failed", error)
        setResult(EMPTY)
      }
      setSettled(text)
    }, DELAY)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, text])

  return { ...result, pending: active && settled !== text }
}
