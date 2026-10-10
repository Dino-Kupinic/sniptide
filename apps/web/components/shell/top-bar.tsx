"use client"

import { Separator } from "@sniptide/ui/components/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { BellIcon, ChevronRightIcon, PanelLeftIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { useBreadcrumb } from "./breadcrumb"
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
  const trail = useBreadcrumb() ?? [{ label: "Workspace" }, { label: title }]

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

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1
          return (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? (
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
              {last ? (
                <span aria-current="page" className="truncate">
                  {crumb.label}
                </span>
              ) : crumb.href ? (
                <Link
                  href={crumb.href}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="shrink-0 text-muted-foreground">{crumb.label}</span>
              )}
            </React.Fragment>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
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
