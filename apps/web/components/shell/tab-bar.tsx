"use client"

import { cn } from "@workspace/ui/lib/utils"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { isActivePath, mobileTabs } from "./nav-config"

// Bottom tab bar below lg. "More" stands in for everything the sidebar holds beyond the
// three main tabs, so it lights up on Settings, Shared with me, Trash and collections.
export function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex h-14 items-center justify-around px-2">
        {mobileTabs.slice(0, 2).map((tab) => (
          <Tab
            key={tab.href}
            tab={tab}
            active={tab.match.some((href) => isActivePath(pathname, href))}
          />
        ))}
        <Link
          href="/new"
          aria-label="New paste"
          className="flex w-15 justify-center outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring/40 focus-visible:[&>span]:ring-offset-2"
        >
          <span className="flex h-10 w-12 items-center justify-center bg-primary text-primary-foreground">
            <PlusIcon className="size-[22px]" strokeWidth={2.4} />
          </span>
        </Link>
        {mobileTabs.slice(2).map((tab) => (
          <Tab
            key={tab.href}
            tab={tab}
            active={tab.match.some((href) => isActivePath(pathname, href))}
          />
        ))}
      </div>
    </nav>
  )
}

function Tab({ tab, active }: { tab: (typeof mobileTabs)[number]; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-15 flex-col items-center gap-[3px] text-[11px] leading-[14px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active && "font-semibold text-foreground",
      )}
    >
      <tab.icon className="size-[22px]" />
      {tab.label}
    </Link>
  )
}
