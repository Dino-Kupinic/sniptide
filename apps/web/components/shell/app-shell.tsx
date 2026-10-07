"use client"

import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import { usePathname } from "next/navigation"
import * as React from "react"
import { MobileTopBar } from "./mobile-top-bar"
import { mobileChrome } from "./nav-config"
import { Sidebar, type SidebarProps } from "./sidebar"
import { TabBar } from "./tab-bar"
import { TopBar } from "./top-bar"

export function AppShell({
  children,
  ...sidebarProps
}: SidebarProps & { children: React.ReactNode }) {
  const pathname = usePathname()
  const chrome = mobileChrome(pathname)
  const [collapsed, setCollapsed] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        // Below lg there is no sidebar to collapse; navigation lives in the tab bar.
        if (!window.matchMedia("(min-width: 1024px)").matches) return
        event.preventDefault()
        setCollapsed((value) => !value)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <TooltipProvider delay={300}>
      <div className="flex min-h-svh bg-background lg:bg-sidebar">
        <aside
          aria-label="Sidebar"
          className={cn(
            "sticky top-0 hidden h-svh w-64 shrink-0 overflow-y-auto lg:block",
            collapsed && "lg:hidden",
          )}
        >
          <Sidebar {...sidebarProps} />
        </aside>

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background lg:my-2 lg:mr-2 lg:border lg:border-border",
            collapsed && "lg:ml-2",
          )}
        >
          <TopBar
            onToggleSidebar={() => setCollapsed((value) => !value)}
            sidebarOpen={!collapsed}
          />
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
    </TooltipProvider>
  )
}
