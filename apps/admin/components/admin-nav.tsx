"use client"

import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { activeSection, SECTIONS } from "@/lib/sections"

// The section links: a column in the desktop sidebar and a row under the top bar on phones.
export function AdminNav({ layout }: { layout: "column" | "row" }) {
  const active = activeSection(usePathname())
  return (
    <nav aria-label="Sections">
      <ul className={cn("flex gap-1", layout === "column" ? "flex-col" : "flex-row")}>
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const current = href === active
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
                  layout === "column" ? "h-8" : "h-10",
                  current ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
