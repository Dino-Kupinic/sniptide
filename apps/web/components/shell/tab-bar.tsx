"use client"

import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCommandMenu } from "@/components/command-menu/command-menu"
import { isActivePath, mobileTabs } from "./nav-config"

// The tour outlines its target 2px outside it, which a tab at the screen edge has no room for, so
// it sits inside the tab.
const tabClass =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 self-stretch text-[11px] leading-[14px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset data-tour-current:-outline-offset-2 aria-[current=page]:font-semibold aria-[current=page]:text-link"

// Bottom tab bar below lg: Home, Pastes and Library as pages, then Search, which opens the
// command menu. The current tab takes the link color, like a tinted iOS tab bar.
export function TabBar() {
  const t = useTranslations("Workspace")
  const pathname = usePathname()
  const { open: openCommandMenu, importGist } = useCommandMenu()
  // The root 404 renders the tab bar outside the app shell, where no command menu listens, so
  // Search leads to the pastes list instead.
  const inShell = importGist !== null

  return (
    <nav
      aria-label={t("main")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex h-14 items-stretch pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        {mobileTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={
              tab.match.some((href) => isActivePath(pathname, href)) ? "page" : undefined
            }
            data-tour={tab.href === "/library" ? "library-tab" : undefined}
            className={tabClass}
          >
            <tab.icon className="size-6" strokeWidth={1.75} />
            {t(tab.label)}
          </Link>
        ))}
        {inShell ? (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={openCommandMenu}
            data-tour="search-tab"
            className={tabClass}
          >
            <SearchIcon className="size-6" strokeWidth={1.75} />
            {t("search")}
          </button>
        ) : (
          <Link href="/pastes" className={tabClass}>
            <SearchIcon className="size-6" strokeWidth={1.75} />
            {t("search")}
          </Link>
        )}
      </div>
    </nav>
  )
}
