"use client"

import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

const lists = [
  { href: "/pastes", label: "all" },
  { href: "/starred", label: "starred" },
  { href: "/shared", label: "shared" },
] as const

// The phone's switch between the three lists of pastes, drawn like the segmented control. Each
// option is a page, so the switch is a row of links and the current one is marked as the page.
export function ListSwitch({ className }: { className?: string }) {
  const t = useTranslations("Workspace")
  const pathname = usePathname()
  return (
    <nav
      aria-label={t("pastes")}
      className={cn("flex gap-0.5 rounded-lg bg-muted p-[3px] lg:hidden", className)}
    >
      {lists.map((list) => (
        <Link
          key={list.href}
          href={list.href}
          aria-current={pathname === list.href ? "page" : undefined}
          className="flex h-7 flex-1 items-center justify-center rounded-md text-sm font-medium outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-background aria-[current=page]:font-semibold aria-[current=page]:shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
        >
          {t(list.label)}
        </Link>
      ))}
    </nav>
  )
}
