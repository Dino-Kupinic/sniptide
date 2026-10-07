"use client"

import { Sheet, SheetContent, SheetTitle } from "@workspace/ui/components/sheet"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { Sidebar, type SidebarProps } from "./sidebar"
import { TopBar } from "./top-bar"

export function AppShell({
  children,
  ...sidebarProps
}: Omit<SidebarProps, "onNavigate"> & { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function toggleSidebar() {
    // Below lg the sidebar lives in a sheet; above it, it collapses in place.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((value) => !value)
    } else {
      setMobileOpen(true)
    }
  }

  return (
    <TooltipProvider delay={300}>
      <div className="flex min-h-svh bg-sidebar">
        <aside
          aria-label="Sidebar"
          className={cn(
            "sticky top-0 hidden h-svh w-64 shrink-0 overflow-y-auto lg:block",
            collapsed && "lg:hidden",
          )}
        >
          <Sidebar {...sidebarProps} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent className="bg-sidebar">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background lg:my-2 lg:mr-2 lg:border lg:border-border",
            collapsed && "lg:ml-2",
          )}
        >
          <TopBar onToggleSidebar={toggleSidebar} sidebarOpen={!collapsed} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}
