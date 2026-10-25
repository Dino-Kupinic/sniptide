import type { Metadata } from "next"
import { AnalyticsPreferences } from "@/components/analytics-preferences"

export const metadata: Metadata = {
  title: "Analytics preference · Sniptide",
  robots: { index: false, follow: false },
}

export default function AnalyticsPreferencePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Analytics preference</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Exclude your own visits from Sniptide&apos;s visitor and usage counts. This page never sends
        analytics events.
      </p>
      <AnalyticsPreferences />
      <a href="/" className="text-sm underline underline-offset-4">
        Return to Sniptide
      </a>
    </main>
  )
}
