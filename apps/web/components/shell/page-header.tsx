"use client"

import * as React from "react"
import { createPortal } from "react-dom"

// Common list controls render directly in TopBar, including on the server. These slots
// carry page-specific titles and actions whose state belongs to the editor or detail view.
// Without a HeaderTitle, the bar shows the route title and its known count.
const HeaderSlotsContext = React.createContext<{
  title: HTMLElement | null
  actions: HTMLElement | null
}>({ title: null, actions: null })

const SetSlotsContext = React.createContext<{
  setTitle: (element: HTMLElement | null) => void
  setActions: (element: HTMLElement | null) => void
}>({ setTitle: () => {}, setActions: () => {} })

const ListViewContext = React.createContext<{
  view: "list" | "grid"
  setView: (view: "list" | "grid") => void
} | null>(null)

export function useListView() {
  const value = React.useContext(ListViewContext)
  if (!value) throw new Error("useListView must be used inside HeaderSlotsProvider")
  return value
}

export function HeaderSlotsProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<HTMLElement | null>(null)
  const [actions, setActions] = React.useState<HTMLElement | null>(null)
  const [view, setView] = React.useState<"list" | "grid">("list")
  const listView = React.useMemo(() => ({ view, setView }), [view])
  const slots = React.useMemo(() => ({ title, actions }), [title, actions])
  const setters = React.useMemo(() => ({ setTitle, setActions }), [])

  return (
    <SetSlotsContext.Provider value={setters}>
      <HeaderSlotsContext.Provider value={slots}>
        <ListViewContext.Provider value={listView}>{children}</ListViewContext.Provider>
      </HeaderSlotsContext.Provider>
    </SetSlotsContext.Provider>
  )
}

export function useHeaderSlotRefs() {
  return React.useContext(SetSlotsContext)
}

export function HeaderTitle({ children }: { children: React.ReactNode }) {
  const { title } = React.useContext(HeaderSlotsContext)
  if (!title) return null
  return createPortal(
    <div data-header-title="" className="flex min-w-0 items-center gap-2.5">
      {children}
    </div>,
    title,
  )
}

export function HeaderActions({ children }: { children: React.ReactNode }) {
  const { actions } = React.useContext(HeaderSlotsContext)
  if (!actions) return null
  return createPortal(
    <div data-header-actions-content="" className="contents">
      {children}
    </div>,
    actions,
  )
}
