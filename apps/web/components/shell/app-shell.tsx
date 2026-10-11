"use client"

import { TooltipProvider } from "@sniptide/ui/components/tooltip"
import { cn } from "@sniptide/ui/lib/utils"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { MobileTopBar } from "./mobile-top-bar"
import { mobileChrome } from "./nav-config"
import { HeaderSlotsProvider } from "./page-header"
import { Sidebar, type SidebarProps } from "./sidebar"
import {
  type SectionId,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type SidebarState,
  sidebarMaxWidth,
  writeSidebarState,
} from "./sidebar-state"
import { TabBar } from "./tab-bar"
import { TopBar } from "./top-bar"

export function AppShell({
  children,
  initialSidebar,
  ...sidebarProps
}: SidebarProps & { initialSidebar: SidebarState; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const chrome = mobileChrome(pathname)
  const [layout, setLayout] = React.useState(initialSidebar)
  // While the edge is being dragged: the width under the pointer, which can go below the minimum.
  const [dragWidth, setDragWidth] = React.useState<number | null>(null)

  const update = React.useCallback((change: (state: SidebarState) => SidebarState) => {
    setLayout((state) => {
      const next = change(state)
      writeSidebarState(next)
      return next
    })
  }, [])

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

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        // Below lg there is no sidebar to collapse; navigation lives in the tab bar.
        if (!window.matchMedia("(min-width: 1024px)").matches) return
        event.preventDefault()
        toggleSidebar()
      }
      // ⌘, opens settings, as shown in the account menu.
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
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
    <TooltipProvider delay={300}>
      <HeaderSlotsProvider>
        <div className="flex min-h-svh bg-background lg:bg-sidebar">
          <aside
            aria-label="Sidebar"
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
                onToggleSection={toggleSection}
                onToggleSidebar={toggleSidebar}
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
              "flex min-w-0 flex-1 flex-col bg-background lg:my-2 lg:mr-2 lg:border lg:border-border",
              layout.collapsed && "lg:ml-2",
            )}
          >
            <TopBar onToggleSidebar={toggleSidebar} sidebarOpen={!layout.collapsed} />
            {chrome.topBar ? <MobileTopBar viewer={sidebarProps.viewer} /> : null}
            <main
              className={cn(
                "flex-1",
                chrome.tabBar && "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0",
              )}
            >
              {children}
            </main>
          </div>

          {chrome.tabBar ? <TabBar /> : null}
        </div>
      </HeaderSlotsProvider>
    </TooltipProvider>
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
      aria-label="Resize sidebar"
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
