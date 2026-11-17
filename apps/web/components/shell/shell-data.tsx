"use client"

import * as React from "react"
import type { Collection } from "@/lib/collections/types"
import type { SidebarData } from "@/lib/pastes/types"

// What the shell lists and counts. The layout starts these reads and hands over the promise, so
// the frame renders before they finish.
export interface ShellData {
  sidebar: SidebarData
  collections: Collection[]
  trashCount: number
}

const PromiseContext = React.createContext<Promise<ShellData> | null>(null)
const SettledContext = React.createContext<ShellData | null>(null)

export function ShellDataProvider({
  data,
  children,
}: {
  data: Promise<ShellData>
  children: React.ReactNode
}) {
  // The last data that arrived. A refresh keeps it until the next read finishes.
  const [settled, setSettled] = React.useState<ShellData | null>(null)
  React.useEffect(() => {
    let current = true
    data.then(
      (value) => {
        if (current) setSettled(value)
      },
      () => {},
    )
    return () => {
      current = false
    }
  }, [data])

  return (
    <PromiseContext.Provider value={data}>
      <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>
    </PromiseContext.Provider>
  )
}

// Suspends until the data arrives. Call it under a Suspense boundary whose fallback has the
// shape of what the data fills in.
export function useShellData() {
  const data = React.useContext(PromiseContext)
  if (!data) throw new Error("useShellData must be used inside ShellDataProvider")
  return React.use(data)
}

// The data once it has arrived, and null before. For dialogs, menus and loading states, which
// work without it and never hold up the frame.
export function useSettledShellData() {
  return React.useContext(SettledContext)
}
