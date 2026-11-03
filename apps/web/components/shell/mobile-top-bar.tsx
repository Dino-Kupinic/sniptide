"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { Logo } from "@sniptide/ui/components/logo"
import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useCommandMenu } from "@/components/command-menu/command-menu"
import type { ViewerSummary } from "@/lib/viewer"
import { AccountMenuItems } from "./account-menu"
import { NotificationsSheet } from "./notifications-menu"

// Top bar below lg: wordmark, search, account, then notifications at the far right.
export function MobileTopBar({ viewer }: { viewer: ViewerSummary }) {
  const t = useTranslations("Workspace")
  const { open: openCommandMenu } = useCommandMenu()
  return (
    <header className="sticky top-0 z-30 flex min-h-[52px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-background pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] box-content lg:hidden">
      <Link
        href="/dashboard"
        aria-label={t("sniptide_dashboard")}
        className="min-w-[calc(29.05px+0.5rem)] flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Logo className="min-w-0 max-w-full [&>span]:min-w-0 [&>span]:shrink [&>span>svg]:max-w-full" />
      </Link>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button variant="outline" size="icon-lg" aria-label={t("search")} onClick={openCommandMenu}>
          <SearchIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("account")}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Avatar className="size-9 rounded-lg font-heading text-[13px] font-bold">
              {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <AccountMenuItems name={viewer.name} email={viewer.email} inlineLanguage />
          </DropdownMenuContent>
        </DropdownMenu>
        <NotificationsSheet />
      </div>
    </header>
  )
}
