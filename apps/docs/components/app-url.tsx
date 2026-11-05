"use client"

import { createContext, type ReactNode, use } from "react"

// APP_URL is read on the server when the site is built (lib/site.ts), so the layout hands it to the
// client components that link into the app, such as the header's Sign in and Get started.
const AppUrlContext = createContext("https://app.sniptide.com")

export function AppUrlProvider({ value, children }: { value: string; children: ReactNode }) {
  return <AppUrlContext value={value}>{children}</AppUrlContext>
}

export function useAppUrl() {
  return use(AppUrlContext)
}
