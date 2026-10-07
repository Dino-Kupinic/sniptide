"use client"

import { Kbd } from "@workspace/ui/components/kbd"
import { Separator } from "@workspace/ui/components/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { BellIcon, ChevronRightIcon, MenuIcon, PanelLeftIcon, SearchIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { LogoMark } from "@/components/logo"
import { pageTitles } from "./nav-config"

const iconButtonClass =
  "inline-flex size-9 shrink-0 items-center justify-center text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4"

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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 lg:h-[56px] lg:px-4">
      <Tooltip>
        <TooltipTrigger
          className={iconButtonClass}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          aria-expanded={sidebarOpen}
        >
          <PanelLeftIcon className="hidden lg:block" />
          <MenuIcon className="lg:hidden" />
        </TooltipTrigger>
        <TooltipContent side="bottom">⌘B</TooltipContent>
      </Tooltip>

      <LogoMark className="size-6 lg:hidden" />

      <Separator orientation="vertical" className="my-4 hidden lg:block" />

      <nav aria-label="Breadcrumb" className="hidden items-center gap-2 text-sm lg:flex">
        <span className="text-muted-foreground">Workspace</span>
        <ChevronRightIcon className="size-3.5 text-muted-foreground" />
        <span aria-current="page">{title}</span>
      </nav>
      <span className="text-sm font-medium lg:hidden">{title}</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="hidden h-9 w-72 items-center gap-2 border border-border px-3 text-sm text-muted-foreground outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40 md:flex"
        >
          <SearchIcon className="size-4" />
          Search pastes, slugs, code…
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>
        <button type="button" aria-label="Search" className={`${iconButtonClass} md:hidden`}>
          <SearchIcon />
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
