"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

// Several writes in a row, like an agent saving a batch of pastes, become one refresh.
const SETTLE_MS = 400

// Keeps every signed-in screen current when data changes somewhere else: a paste saved through
// the MCP server, the API or the CLI, or an edit in another tab. The server announces changes on
// /api/live and the page fetches its server data again, keeping client state such as drafts.
// A hidden tab waits until it is shown, and a tab that lost the stream refreshes when it is back.
export function LiveUpdates() {
  const router = useRouter()

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending = false
    let dropped = false

    function refresh() {
      pending = false
      router.refresh()
    }

    function schedule() {
      pending = true
      if (document.hidden) return
      clearTimeout(timer)
      timer = setTimeout(refresh, SETTLE_MS)
    }

    const source = new EventSource("/api/live")
    source.addEventListener("change", schedule)
    source.addEventListener("error", () => {
      dropped = true
    })
    // Changes made while the stream was down were missed, so refresh once it is back.
    source.addEventListener("open", () => {
      if (!dropped) return
      dropped = false
      schedule()
    })

    function onVisibilityChange() {
      if (!document.hidden && pending) schedule()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      clearTimeout(timer)
      source.close()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [router])

  return null
}
