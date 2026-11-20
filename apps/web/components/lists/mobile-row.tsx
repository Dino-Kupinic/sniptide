import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import type * as React from "react"
import { LanguageIcon } from "@/components/paste/language-icon"

// One row of a phone list of pastes, like an iOS table row: the language logo on a tile, the title
// with one line of detail below it, an inset divider and a chevron. The whole row opens the paste.
export function MobileRow({
  href,
  language,
  title,
  badge,
  detail,
}: {
  href: string
  language: string
  title: string
  // Marks after the title, such as the dot of a paste that is new to the reader.
  badge?: React.ReactNode
  detail: React.ReactNode
}) {
  return (
    <li className="group/item relative flex min-h-[68px] items-center gap-3.5 pl-4 active:bg-muted">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <LanguageIcon language={language} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch border-b border-border pr-4 group-last/item:border-b-0">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-3">
          <span className="flex min-w-0 items-center gap-2">
            <Link
              href={href}
              title={title}
              className="min-w-0 truncate text-[17px] leading-[22px] font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              {title}
            </Link>
            {badge}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-[15px] leading-5 text-muted-foreground">
            {detail}
          </span>
        </div>
        <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground/60" />
      </div>
    </li>
  )
}
