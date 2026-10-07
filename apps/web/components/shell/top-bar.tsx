"use client"

import { Kbd } from "@workspace/ui/components/kbd"
import { Separator } from "@workspace/ui/components/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { BellIcon, ChevronRightIcon, PanelLeftIcon, SearchIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { pageTitles } from "./nav-config"

const iconButtonClass =
  "inline-flex size-9 shrink-0 items-center justify-center text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4"

// Desktop top bar (lg and up). Below lg the shell shows MobileTopBar instead.
export function TopBar({
  onToggleSidebar,
  sidebarOpen,
}: {
  onToggleSidebar: () => void
  sidebarOpen: boolean
}) {
  const pathname = usePathname()
  const section = pathname.split("/")[1] ?? ""
  const title = pageTitles[section] ?? "Workspace"

  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 lg:flex">
      <Tooltip>
        <TooltipTrigger
          className={iconButtonClass}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
        >
          <PanelLeftIcon />
        </TooltipTrigger>
        <TooltipContent side="bottom">⌘B</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="my-4" />

      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Workspace</span>
        <ChevronRightIcon className="size-3.5 text-muted-foreground" />
        <span aria-current="page">{title}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-72 items-center gap-2 border border-border px-3 text-sm text-muted-foreground outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <SearchIcon className="size-4" />
          Search pastes, slugs, code…
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className={`${iconButtonClass} border border-border`}
        >
          <BellIcon />
        </button>
      </div>
    </header>
  )
}
