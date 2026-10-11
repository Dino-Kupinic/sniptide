"use client"

import * as React from "react"
import { ANALYTICS_PATH, type AnalyticsConfig, startAnalytics } from "@/lib/analytics"

// Starts PostHog when the server has a key. The key is read at runtime from the server rather
// than baked into the build, so one image serves sniptide.com and self-hosted instances alike.
export function Analytics() {
  React.useEffect(() => {
    fetch(ANALYTICS_PATH)
      .then((response) => (response.ok ? (response.json() as Promise<AnalyticsConfig>) : null))
      .then((config) => {
        if (config) startAnalytics(config)
      })
      .catch(() => {})
  }, [])

  return null
}
