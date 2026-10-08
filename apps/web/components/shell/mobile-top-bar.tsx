"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { Logo } from "@/components/logo"
import type { ViewerSummary } from "@/lib/mock-data"
import { AccountMenuItems } from "./account-menu"

// Top bar below lg, from the Paper mobile artboards: wordmark, search, account avatar.
export function MobileTopBar({ viewer }: { viewer: ViewerSummary }) {
  return (
    <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center justify-between bg-background px-4 pt-[env(safe-area-inset-top)] box-content lg:hidden">
      <Link
        href="/dashboard"
        className="outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Search"
          className="inline-flex size-9 items-center justify-center border border-border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-[17px]"
        >
          <SearchIcon />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account"
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Avatar className="size-9 font-heading text-[13px] font-bold">
              {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <AccountMenuItems email={viewer.email} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
