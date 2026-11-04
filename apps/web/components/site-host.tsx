"use client"

import { createContext, useContext } from "react"

// Host this instance is served from (app.sniptide.com, localhost:3000, a self-hosted domain), so
// link prefixes in forms read the same as the links people end up sharing. `origin` is where
// share links and profiles live (SHARE_URL, or the request's own origin), for links that leave
// the app for them; it's empty where relative links do.
const SiteHostContext = createContext({ host: "sniptide.com", origin: "" })

export function SiteHostProvider({
  host,
  origin = "",
  children,
}: {
  host: string
  origin?: string
  children: React.ReactNode
}) {
  return <SiteHostContext value={{ host, origin }}>{children}</SiteHostContext>
}

export function useSiteHost() {
  return useContext(SiteHostContext).host
}

export function useSiteOrigin() {
  return useContext(SiteHostContext).origin
}
