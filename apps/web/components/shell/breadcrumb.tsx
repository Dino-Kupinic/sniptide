"use client"

import * as React from "react"

export interface Crumb {
  label: string
  href?: string
}

// Pages that need more than the route's default title (a paste's name, say) set their trail
// with <SetBreadcrumb>. The top bar falls back to "Workspace › <section>" otherwise.
const BreadcrumbContext = React.createContext<{
  trail: Crumb[] | null
  setTrail: (trail: Crumb[] | null) => void
}>({ trail: null, setTrail: () => {} })

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [trail, setTrail] = React.useState<Crumb[] | null>(null)
  const value = React.useMemo(() => ({ trail, setTrail }), [trail])

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

export function useBreadcrumb() {
  return React.useContext(BreadcrumbContext).trail
}

export function SetBreadcrumb({ trail }: { trail: Crumb[] }) {
  const { setTrail } = React.useContext(BreadcrumbContext)
  const key = JSON.stringify(trail)

  React.useEffect(() => {
    setTrail(JSON.parse(key))
    return () => setTrail(null)
  }, [key, setTrail])

  return null
}
