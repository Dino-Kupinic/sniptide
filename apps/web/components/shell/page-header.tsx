"use client"

import * as React from "react"
import { createPortal } from "react-dom"

// The desktop top bar has two slots a page can fill: the title on the left and the page's
// actions on the right. Pages render <HeaderTitle> and <HeaderActions> wherever their state
// lives (the editor keeps Preview and Create next to its form state), and the content is
// portalled into the bar. Without a <HeaderTitle> the bar shows the route's own title.
const HeaderSlotsContext = React.createContext<{
  title: HTMLElement | null
  actions: HTMLElement | null
}>({ title: null, actions: null })

const SetSlotsContext = React.createContext<{
  setTitle: (element: HTMLElement | null) => void
  setActions: (element: HTMLElement | null) => void
}>({ setTitle: () => {}, setActions: () => {} })

export function HeaderSlotsProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<HTMLElement | null>(null)
  const [actions, setActions] = React.useState<HTMLElement | null>(null)
  const slots = React.useMemo(() => ({ title, actions }), [title, actions])
  const setters = React.useMemo(() => ({ setTitle, setActions }), [])

  return (
    <SetSlotsContext.Provider value={setters}>
      <HeaderSlotsContext.Provider value={slots}>{children}</HeaderSlotsContext.Provider>
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
  return createPortal(children, actions)
}
