"use client"

import { Kbd } from "@sniptide/ui/components/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { PanelLeftIcon, SearchIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { useCommandMenu } from "@/components/command-menu/command-menu"
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
    <header className="sticky top-0 z-30 hidden min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-6 py-2 lg:flex">
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

      <div
        ref={setActions}
        className="flex max-w-full shrink-0 flex-wrap items-center gap-2 empty:hidden"
      />
      {sidebarOpen ? null : <SearchField />}
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <NotificationsMenu className={`${iconButtonClass} border border-border`} />
    </header>
  )
}

// The sidebar's Search button is the usual way in; with the sidebar hidden this field stands in.
function SearchField() {
  const { open } = useCommandMenu()
  return (
    <button
      type="button"
      onClick={open}
      className="flex h-9 w-72 shrink-0 items-center gap-2 border border-border bg-background pr-2 pl-2.5 text-[13px] text-muted-foreground outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <SearchIcon className="size-3.5" />
      Search pastes, collections…
      <Kbd className="ml-auto border border-border">⌘K</Kbd>
    </button>
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
