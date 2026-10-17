"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
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

// Top bar below lg, from the Paper mobile artboards: wordmark, search, account avatar.
export function MobileTopBar({ viewer }: { viewer: ViewerSummary }) {
  const t = useTranslations("Workspace")
  const { open: openCommandMenu } = useCommandMenu()
  return (
    <header className="sticky top-0 z-30 flex min-h-[52px] shrink-0 items-center justify-between gap-3 bg-background px-4 pt-[env(safe-area-inset-top)] box-content lg:hidden">
      <Link
        href="/dashboard"
        aria-label={t("sniptide_dashboard")}
        className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Logo className="min-w-0 [&>span]:truncate" />
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={t("search")}
          onClick={openCommandMenu}
          className="inline-flex size-9 items-center justify-center border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-[17px]"
        >
          <SearchIcon />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("account")}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Avatar className="size-9 font-heading text-[13px] font-bold">
              {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <AccountMenuItems name={viewer.name} email={viewer.email} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
