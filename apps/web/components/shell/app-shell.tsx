"use client"

import { TooltipProvider } from "@sniptide/ui/components/tooltip"
import { cn } from "@sniptide/ui/lib/utils"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { CommandMenuProvider } from "@/components/command-menu/command-menu"
import { TourProvider } from "@/components/onboarding/tour"
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-help"
import { matchesCombo, shortcut } from "@/lib/shortcuts"
import type { ViewerSummary } from "@/lib/viewer"
import { LiveUpdates } from "./live-updates"
import { MobileTopBar } from "./mobile-top-bar"
import { mobileChrome } from "./nav-config"
import { NotificationsProvider } from "./notifications-menu"
import { HeaderSlotsProvider } from "./page-header"
import { type ShellData, ShellDataProvider } from "./shell-data"
import { Sidebar, type SidebarProps } from "./sidebar"
import {
  type SectionId,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type SidebarShape,
  type SidebarState,
  sidebarMaxWidth,
  writeSidebarState,
} from "./sidebar-state"
import { createStore, type Store, useStore } from "./store"
import { TabBar } from "./tab-bar"
import { TopBar } from "./top-bar"

type SidebarUpdate = (change: (state: SidebarState) => SidebarState) => void

const SidebarUpdateContext = React.createContext<SidebarUpdate | null>(null)

// Changes the sidebar layout from outside the sidebar, such as reordering collections on the
// Collections page, so the open sidebar and its cookie stay in step.
export function useSidebarUpdate() {
  const update = React.useContext(SidebarUpdateContext)
  if (!update) throw new Error("useSidebarUpdate must be used inside AppShell")
  return update
}

const ViewerContext = React.createContext<ViewerSummary | null>(null)

// The signed-in account, for screens that name it before their own data arrives.
export function useViewer() {
  const viewer = React.useContext(ViewerContext)
  if (!viewer) throw new Error("useViewer must be used inside AppShell")
  return viewer
}

const SidebarStateContext = React.createContext<Store<SidebarState> | null>(null)

// The sidebar's layout as it stands now, for screens that follow its order.
export function useSidebarState() {
  const state = React.useContext(SidebarStateContext)
  if (!state) throw new Error("useSidebarState must be used inside AppShell")
  return useStore(state)
}

export function AppShell({
  children,
  initialSidebar,
  demo = false,
  tour = false,
  data,
  ...sidebarProps
}: SidebarProps & {
  initialSidebar: SidebarState
  demo?: boolean
  // Whether the tour starts by itself on the dashboard, which it does once for a new account.
  tour?: boolean
  // The lists and counts the shell shows. Still loading when the frame first renders.
  data: Promise<ShellData>
  children: React.ReactNode
}) {
  const t = useTranslations("Workspace")
  const pathname = usePathname()
  const router = useRouter()
  const chrome = mobileChrome(pathname)
  const [sidebarState] = React.useState(() => createStore(initialSidebar))
  const layout = useStore(sidebarState)
  // While the edge is being dragged: the width under the pointer, which can go below the minimum.
  const [dragWidth, setDragWidth] = React.useState<number | null>(null)

  const update = React.useCallback(
    (change: (state: SidebarState) => SidebarState) => {
      const next = change(sidebarState.get())
      if (next === sidebarState.get()) return
      writeSidebarState(next)
      sidebarState.set(next)
    },
    [sidebarState],
  )

  const toggleSidebar = React.useCallback(
    () => update((state) => ({ ...state, collapsed: !state.collapsed })),
    [update],
  )

  const toggleSection = React.useCallback(
    (section: SectionId) =>
      update((state) => ({
        ...state,
        closed: state.closed.includes(section)
          ? state.closed.filter((id) => id !== section)
          : [...state.closed, section],
      })),
    [update],
  )

  // Kept in the cookie, so the next request can greet by the viewer's time of day.
  React.useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timeZone) update((state) => (state.timeZone === timeZone ? state : { ...state, timeZone }))
  }, [update])

  const setShape = React.useCallback(
    (shape: SidebarShape) => update((state) => ({ ...state, shape })),
    [update],
  )

  // The tour points at the sidebar on desktop, so a hidden sidebar comes back for it.
  const showSidebar = React.useCallback(
    () => update((state) => (state.collapsed ? { ...state, collapsed: false } : state)),
    [update],
  )

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (matchesCombo(event, shortcut("toggle-sidebar").keys)) {
        // Below lg there is no sidebar to collapse; navigation lives in the tab bar.
        if (!window.matchMedia("(min-width: 1024px)").matches) return
        event.preventDefault()
        toggleSidebar()
      }
      // ⌘, opens settings, as shown in the account menu.
      if (matchesCombo(event, shortcut("settings").keys)) {
        event.preventDefault()
        router.push("/settings")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggleSidebar, router])

  // A window made smaller than four times the sidebar squeezes it back to a quarter.
  const [maxWidth, setMaxWidth] = React.useState<number | null>(null)
  React.useEffect(() => {
    const measure = () => setMaxWidth(sidebarMaxWidth(window.innerWidth))
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const settledWidth = maxWidth === null ? layout.width : Math.min(layout.width, maxWidth)
  const width = dragWidth ?? settledWidth
  const releaseToCollapse = dragWidth !== null && dragWidth < SIDEBAR_MIN_WIDTH

  return (
    <SidebarUpdateContext.Provider value={update}>
      <SidebarStateContext.Provider value={sidebarState}>
        <ViewerContext.Provider value={sidebarProps.viewer}>
          <ShellDataProvider data={data}>
            <TooltipProvider delay={300}>
              <HeaderSlotsProvider>
                <NotificationsProvider>
                  <ShortcutsProvider>
                    <CommandMenuProvider>
                      <TourProvider autoStart={tour} onBeforeStart={showSidebar}>
                        <a
                          href="#main-content"
                          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground focus:ring-2 focus:ring-ring"
                        >
                          {t("skipToMain")}
                        </a>
                        <div className="flex min-h-svh bg-background lg:bg-sidebar">
                          <aside
                            aria-label={t("sidebar")}
                            style={{ width }}
                            className={cn(
                              "sticky top-0 hidden h-svh shrink-0 lg:block",
                              layout.collapsed && "lg:hidden",
                              dragWidth !== null && "select-none",
                            )}
                          >
                            <div
                              className={cn(
                                "h-full overflow-hidden transition-opacity",
                                releaseToCollapse && "opacity-50",
                              )}
                            >
                              <Sidebar
                                {...sidebarProps}
                                closed={layout.closed}
                                sectionOrder={layout.sectionOrder}
                                collectionOrder={layout.collectionOrder}
                                onReorderSections={(sectionOrder) =>
                                  update((state) => ({ ...state, sectionOrder }))
                                }
                                onReorderCollections={(collectionOrder) =>
                                  update((state) => ({ ...state, collectionOrder }))
                                }
                                onToggleSection={toggleSection}
                                onToggleSidebar={toggleSidebar}
                                shape={layout.shape}
                                onShape={setShape}
                                views={layout.views}
                                onChangeViews={(views) => {
                                  const refetch =
                                    JSON.stringify(views.pastes) !==
                                      JSON.stringify(layout.views.pastes) ||
                                    JSON.stringify(views.starred) !==
                                      JSON.stringify(layout.views.starred)
                                  // Write the cookie before refreshing, so the server lists what the filter
                                  // asks for.
                                  update((state) => ({ ...state, views }))
                                  if (refetch) router.refresh()
                                }}
                              />
                            </div>
                            <ResizeHandle
                              width={width}
                              settledWidth={settledWidth}
                              maxWidth={maxWidth ?? settledWidth}
                              onDrag={setDragWidth}
                              onRelease={(next) => {
                                setDragWidth(null)
                                if (next < SIDEBAR_MIN_WIDTH) {
                                  // Collapse like the header button does, and come back at the last good width.
                                  update((state) => ({ ...state, collapsed: true }))
                                } else {
                                  update((state) => ({ ...state, width: next }))
                                }
                              }}
                            />
                          </aside>

                          <div
                            className={cn(
                              "flex min-w-0 flex-1 flex-col bg-background lg:my-2 lg:mr-2 lg:overflow-clip lg:rounded-lg lg:border lg:border-border",
                              layout.collapsed && "lg:ml-2",
                            )}
                          >
                            <TopBar
                              onToggleSidebar={toggleSidebar}
                              sidebarOpen={!layout.collapsed}
                            />
                            {chrome.topBar ? <MobileTopBar viewer={sidebarProps.viewer} /> : null}
                            <main
                              id="main-content"
                              tabIndex={-1}
                              className={cn(
                                "flex-1",
                                chrome.tabBar &&
                                  "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0",
                              )}
                            >
                              {children}
                            </main>
                          </div>

                          {chrome.tabBar ? <TabBar /> : null}
                        </div>
                        {/* The demo's visitors share one guest account, so they don't follow its changes. */}
                        {demo ? null : <LiveUpdates />}
                      </TourProvider>
                    </CommandMenuProvider>
                  </ShortcutsProvider>
                </NotificationsProvider>
              </HeaderSlotsProvider>
            </TooltipProvider>
          </ShellDataProvider>
        </ViewerContext.Provider>
      </SidebarStateContext.Provider>
    </SidebarUpdateContext.Provider>
  )
}

// How far below the minimum the edge still follows the pointer before it stops.
const DRAG_FLOOR = 120

// The sidebar's right edge. Dragging it resizes the sidebar between the minimum and a quarter of
// the window; letting go below the minimum collapses it. Arrow keys resize it too, and a double
// click puts it back to the default width.
function ResizeHandle({
  width,
  settledWidth,
  maxWidth,
  onDrag,
  onRelease,
}: {
  width: number
  settledWidth: number
  maxWidth: number
  onDrag: (width: number | null) => void
  onRelease: (width: number) => void
}) {
  const t = useTranslations("Workspace")
  const [dragging, setDragging] = React.useState(false)

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = settledWidth
    let current = startWidth
    setDragging(true)
    document.body.style.cursor = "col-resize"

    const move = (moveEvent: PointerEvent) => {
      current = Math.max(DRAG_FLOOR, Math.min(maxWidth, startWidth + moveEvent.clientX - startX))
      onDrag(current)
    }
    const up = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", up)
      handle.removeEventListener("pointercancel", up)
      document.body.style.cursor = ""
      setDragging(false)
      onRelease(Math.round(current))
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
    handle.addEventListener("pointercancel", up)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 16
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      onRelease(Math.max(SIDEBAR_MIN_WIDTH, settledWidth - step))
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      onRelease(Math.min(maxWidth, settledWidth + step))
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA pattern for a resize handle; <hr> can't take focus or pointer events.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resize_sidebar")}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onRelease(Math.min(maxWidth, SIDEBAR_DEFAULT_WIDTH))}
      data-dragging={dragging}
      className="group absolute inset-y-0 -right-1.5 z-30 flex w-3 cursor-col-resize justify-center outline-none"
    >
      <span className="h-full w-0.5 bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary group-data-[dragging=true]:bg-primary" />
    </div>
  )
}
