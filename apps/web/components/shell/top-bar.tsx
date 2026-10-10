"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { PanelLeftIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { pageTitle } from "./nav-config"
import { NotificationsMenu } from "./notifications-menu"
import { useHeaderSlotRefs } from "./page-header"

const iconButtonClass =
  "inline-flex size-9 shrink-0 items-center justify-center text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4"

// Desktop top bar (lg and up): the page title on the left, the page's own actions on the right,
// then the bell. There is no breadcrumb; the sidebar already marks where you are. The sidebar
// toggle lives next to the logo, and moves in here only while the sidebar is hidden.
// Below lg the shell shows MobileTopBar instead.
export function TopBar({
  onToggleSidebar,
  sidebarOpen,
}: {
  onToggleSidebar: () => void
  sidebarOpen: boolean
}) {
  const pathname = usePathname()
  const { setTitle, setActions } = useHeaderSlotRefs()

  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-6 lg:flex">
      {sidebarOpen ? null : (
        <>
          <SidebarToggle onToggle={onToggleSidebar} open={false} className="-ml-2" />
          <span aria-hidden="true" className="h-5 w-px bg-border" />
        </>
      )}

      <div
        ref={setTitle}
        className="group/title flex min-w-0 flex-1 items-center text-[15px] font-semibold"
      >
        <span className="truncate group-has-data-header-title/title:hidden">
          {pageTitle(pathname)}
        </span>
      </div>

      <div ref={setActions} className="flex shrink-0 items-center gap-2 empty:hidden" />
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <NotificationsMenu className={`${iconButtonClass} border border-border`} />
    </header>
  )
}

export function SidebarToggle({
  onToggle,
  open,
  className,
}: {
  onToggle: () => void
  open: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        className={`${iconButtonClass} text-foreground/75 hover:text-foreground ${className ?? ""}`}
        onClick={onToggle}
        aria-label={open ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={open}
      >
        <PanelLeftIcon />
      </TooltipTrigger>
      <TooltipContent side="bottom">⌘B</TooltipContent>
    </Tooltip>
  )
}
