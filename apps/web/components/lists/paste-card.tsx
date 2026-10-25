"use client"

import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type * as React from "react"
import { renderToken } from "@/components/paste/code-block"
import { LanguageLabel } from "@/components/paste/language-icon"
import type { HighlightedLines } from "@/lib/highlight/types"
import type { PasteRow } from "@/lib/pastes/rows"
import { VisibilityIcon } from "./paste-list"
import { RowMenu } from "./row-menu"

// A paste in the grid view, drawn like its link preview image: the title large, and a panel with
// the first lines of code that runs off the bottom edge of the card. Lists that show other facts
// pass their own `label` after the language and `detail` in the panel header.
export function PasteCard({
  row,
  lines,
  origin,
  shared = false,
  label,
  detail,
}: {
  row: PasteRow
  lines: HighlightedLines | undefined
  origin: string
  shared?: boolean
  label?: React.ReactNode
  detail?: React.ReactNode
}) {
  const t = useTranslations("Workspace")
  return (
    <li className="rounded-lg relative flex h-64 min-w-0 flex-col overflow-hidden border border-border bg-sidebar px-5 pt-3.5 transition-colors hover:border-foreground/30">
      <div className="flex h-7 min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <LanguageLabel language={row.language} className="min-w-0 shrink-0 text-foreground/80" />
        <span aria-hidden="true">·</span>
        {label ?? (
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 truncate",
              row.burnAfterRead && "text-link",
            )}
          >
            <VisibilityIcon row={row} />
            <span aria-hidden="true" className="truncate">
              {row.burnAfterRead ? t("burn_after_read") : t(row.visibility)}
            </span>
          </span>
        )}
        <span className="-mr-1.5 ml-auto">
          <RowMenu row={row} origin={origin} shared={shared} />
        </span>
      </div>
      <Link
        href={`/pastes/${row.slug}`}
        title={row.title}
        className="mt-2.5 line-clamp-2 h-[60px] shrink-0 font-heading text-2xl/[30px] font-bold tracking-[-0.02em] [overflow-wrap:anywhere] outline-none after:absolute after:inset-0 focus-visible:underline"
      >
        {row.title}
      </Link>
      <div className="mt-3.5 flex min-h-0 flex-1 flex-col rounded-t-lg border border-b-0 border-border bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2 text-xs text-muted-foreground">
          <span className="truncate font-mono">/{row.slug}</span>
          <span className="shrink-0 tabular-nums">
            {detail ?? `${t("views_count", { count: row.views })} · ${row.updatedLabel}`}
          </span>
        </div>
        {lines ? (
          <pre aria-hidden="true" className="overflow-hidden px-3.5 pt-2.5 font-mono text-xs/5">
            {lines.map((tokens, index) => (
              // Lines are fixed for the card's life, so their position is a stable key.
              <div key={index} className="flex whitespace-pre">
                <span className="w-6.5 shrink-0 text-muted-foreground/60 select-none">
                  {index + 1}
                </span>
                <span className="min-w-0 text-(color:--syntax-foreground)">
                  {tokens.map(renderToken)}
                </span>
              </div>
            ))}
          </pre>
        ) : null}
      </div>
    </li>
  )
}
