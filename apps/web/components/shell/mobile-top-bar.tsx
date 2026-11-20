"use client"

import { buttonVariants } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { UserAvatar } from "@/components/people/user-avatar"
import type { ViewerSummary } from "@/lib/viewer"
import { AccountMenuItems } from "./account-menu"
import { NotificationsSheet } from "./notifications-menu"

// Top bar below lg, above the page's large title: notifications, New paste and the account menu
// sit at the trailing edge, like the buttons of an iOS navigation bar.
export function MobileTopBar({ viewer }: { viewer: ViewerSummary }) {
  const t = useTranslations("Workspace")
  return (
    <header className="sticky top-0 z-30 box-content flex h-[52px] shrink-0 items-center justify-end gap-1 bg-background pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] lg:hidden">
      <NotificationsSheet />
      <Link
        href="/new"
        aria-label={t("new_paste")}
        data-tour="new-paste-mobile"
        className={buttonVariants({
          variant: "ghost",
          size: "icon-lg",
          className: "size-10 text-link [&_svg:not([class*='size-'])]:size-6",
        })}
      >
        <PlusIcon strokeWidth={2} />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("account")}
          className="ml-1 flex size-10 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <UserAvatar
            person={{ id: viewer.id, image: viewer.image }}
            className="size-8 rounded-md"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <AccountMenuItems
            name={viewer.name}
            email={viewer.email}
            username={viewer.username}
            inlineLanguage
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
