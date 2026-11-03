"use client"

import { PlusIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { NavigationLink as Link } from "@/components/navigation-link"
import type { ViewerSummary } from "@/lib/viewer"
import { type MoreCounts, MoreSheet } from "./more-sheet"
import { isActivePath, mobileTabs, moreTab } from "./nav-config"

const tabClass =
  "flex w-15 flex-col items-center justify-center gap-[3px] self-stretch text-[11px] leading-[14px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:font-semibold aria-[current=page]:text-foreground"

// Bottom tab bar below lg. "More" opens the More sheet with everything the sidebar holds beyond
// the three main tabs, and lights up on the pages it leads to.
export function TabBar({ viewer, counts }: { viewer: ViewerSummary; counts: MoreCounts }) {
  const t = useTranslations("Workspace")
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = React.useState(false)
  const moreActive = moreTab.match.some((href) => isActivePath(pathname, href))

  return (
    <nav
      aria-label={t("main")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex h-14 items-center justify-around pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
        {mobileTabs.slice(0, 2).map((tab) => (
          <Tab
            key={tab.href}
            tab={tab}
            active={tab.match.some((href) => isActivePath(pathname, href))}
          />
        ))}
        <Link
          href="/new"
          aria-label={t("new_paste")}
          className="flex w-15 justify-center outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-ring/40 focus-visible:[&>span]:ring-offset-2"
        >
          <span className="flex h-10 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
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
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          // Marks the button like the current tab while on one of the pages the sheet leads to.
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setMoreOpen(true)}
          className={tabClass}
        >
          <moreTab.icon className="size-[22px]" />
          {t(moreTab.label)}
        </button>
      </div>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} viewer={viewer} counts={counts} />
    </nav>
  )
}

function Tab({ tab, active }: { tab: (typeof mobileTabs)[number]; active: boolean }) {
  const t = useTranslations("Workspace")
  return (
    <Link href={tab.href} aria-current={active ? "page" : undefined} className={tabClass}>
      <tab.icon className="size-[22px]" />
      {t(tab.label)}
    </Link>
  )
}
