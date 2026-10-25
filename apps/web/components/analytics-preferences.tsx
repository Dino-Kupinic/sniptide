"use client"

import { useEffect, useState } from "react"
import {
  type AnalyticsPreference,
  type AnalyticsPreferenceState,
  getAnalyticsPreference,
  setAnalyticsPreference,
} from "@/lib/analytics-preference"

const messages = {
  loading: "Checking this browser's preference…",
  included: "This browser is included in analytics on this site.",
  excluded: "This browser is excluded from analytics on this site.",
  unavailable:
    "Your browser blocked reading or saving this preference. The change could not be confirmed. This preference page is always excluded from analytics.",
}

export function AnalyticsPreferences() {
  const [state, setState] = useState<AnalyticsPreferenceState | "loading">("loading")

  useEffect(() => {
    const refresh = () => setState(getAnalyticsPreference())
    refresh()
    window.addEventListener("storage", refresh)
    return () => window.removeEventListener("storage", refresh)
  }, [])

  function update(preference: AnalyticsPreference) {
    setState(setAnalyticsPreference(preference))
  }

  return (
    <div className="flex flex-col gap-5">
      <p role="status" aria-live="polite" className="rounded-lg border p-4 text-sm leading-6">
        {messages[state]}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => update("excluded")}
          disabled={state === "loading" || state === "excluded"}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Exclude this browser
        </button>
        <button
          type="button"
          onClick={() => update("included")}
          disabled={state === "loading" || state === "included"}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Include this browser
        </button>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        This choice applies to this site in this browser, including when your network changes. It
        stays saved until you include this browser again or clear this site&apos;s data. Set it
        separately on the marketing site and app, and in each browser you use.
      </p>
      <p className="text-sm leading-6 text-muted-foreground">
        Reload other open tabs after changing this choice. This does not remove past activity or
        change paste view counts.
      </p>
    </div>
  )
}
