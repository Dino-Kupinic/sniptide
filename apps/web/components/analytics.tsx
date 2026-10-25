"use client"

import * as React from "react"
import {
  ANALYTICS_PATH,
  type AnalyticsConfig,
  consumeAuthMarker,
  startAnalytics,
} from "@/lib/analytics"
import { isAnalyticsExcluded } from "@/lib/analytics-preference"

// Starts PostHog when the server has a key. The key is read at runtime from the server rather
// than baked into the build, so one image serves sniptide.com and self-hosted instances alike.
export function Analytics() {
  React.useEffect(() => {
    if (isAnalyticsExcluded()) {
      consumeAuthMarker()
      return
    }
    fetch(ANALYTICS_PATH)
      .then((response) =>
        response.status === 200 ? (response.json() as Promise<AnalyticsConfig>) : null,
      )
      .then((config) => {
        if (config) startAnalytics(config)
        // Also without a key, so the marker never lingers in the address bar.
        consumeAuthMarker()
      })
      .catch(() => {})
  }, [])

  return null
}
