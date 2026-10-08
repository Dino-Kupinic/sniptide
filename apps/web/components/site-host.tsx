"use client"

import { createContext, useContext } from "react"

// Host this instance is served from (app.sniptide.com, localhost:3000, a self-hosted domain), so
// link prefixes in forms read the same as the links people end up sharing.
const SiteHostContext = createContext("sniptide.com")

export function SiteHostProvider({ host, children }: { host: string; children: React.ReactNode }) {
  return <SiteHostContext value={host}>{children}</SiteHostContext>
}

export function useSiteHost() {
  return useContext(SiteHostContext)
}
