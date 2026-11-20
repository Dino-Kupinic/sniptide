"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { createStore, type Store, useStore } from "./store"

// Common list controls render directly in TopBar, including on the server. These slots
// carry page-specific titles and actions whose state belongs to the editor or detail view.
// Without a HeaderTitle, the bar shows the route title and its known count.
interface Slots {
  title: HTMLElement | null
  actions: HTMLElement | null
  // The leading edge of the phone's top bar, for a page action such as Customize on Home.
  leading: HTMLElement | null
}

type ListView = "list" | "grid"

// The slots and the list view live in stores, so the bar can report its slots on mount and a
// view can change without re-rendering a screen that is still streaming.
interface HeaderState {
  slots: Store<Slots>
  view: Store<ListView>
  setTitle: (element: HTMLElement | null) => void
  setActions: (element: HTMLElement | null) => void
  setLeading: (element: HTMLElement | null) => void
  setView: (view: ListView) => void
}

const HeaderContext = React.createContext<HeaderState | null>(null)

function useHeader() {
  const value = React.useContext(HeaderContext)
  if (!value) throw new Error("The page header must be used inside HeaderSlotsProvider")
  return value
}

export function useListView() {
  const { view, setView } = useHeader()
  return { view: useStore(view), setView }
}

export function HeaderSlotsProvider({ children }: { children: React.ReactNode }) {
  const [state] = React.useState<HeaderState>(() => {
    const slots = createStore<Slots>({ title: null, actions: null, leading: null })
    const view = createStore<ListView>("list")
    return {
      slots,
      view,
      setTitle: (title) => {
        if (slots.get().title !== title) slots.set({ ...slots.get(), title })
      },
      setActions: (actions) => {
        if (slots.get().actions !== actions) slots.set({ ...slots.get(), actions })
      },
      setLeading: (leading) => {
        if (slots.get().leading !== leading) slots.set({ ...slots.get(), leading })
      },
      setView: view.set,
    }
  })
  return <HeaderContext.Provider value={state}>{children}</HeaderContext.Provider>
}

export function useHeaderSlotRefs() {
  const { setTitle, setActions, setLeading } = useHeader()
  return { setTitle, setActions, setLeading }
}

export function HeaderTitle({ children }: { children: React.ReactNode }) {
  const { title } = useStore(useHeader().slots)
  if (!title) return null
  return createPortal(
    <div data-header-title="" className="flex min-w-0 items-center gap-2.5">
      {children}
    </div>,
    title,
  )
}

export function HeaderActions({ children }: { children: React.ReactNode }) {
  const { actions } = useStore(useHeader().slots)
  if (!actions) return null
  return createPortal(
    <div data-header-actions-content="" className="contents">
      {children}
    </div>,
    actions,
  )
}

export function MobileHeaderLeading({ children }: { children: React.ReactNode }) {
  const { leading } = useStore(useHeader().slots)
  if (!leading) return null
  return createPortal(children, leading)
}
