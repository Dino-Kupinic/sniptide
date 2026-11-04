"use client"

import { Badge } from "@sniptide/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
  TableSortHead,
} from "@sniptide/ui/components/table"
import { cn } from "@sniptide/ui/lib/utils"
import { FlameIcon, GlobeIcon, LinkIcon, LockIcon, StarIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { NavigationLink as Link } from "@/components/navigation-link"
import { usePasteExpired } from "@/components/paste/expiry-status"
import { LanguageIcon, LanguageLabel } from "@/components/paste/language-icon"
import { showUndo } from "@/components/undo-toast"
import { formatNumber } from "@/lib/format"
import { setStarred } from "@/lib/pastes/actions"
import type { PasteSort, SortDirection } from "@/lib/pastes/list-query"
import type { PasteRow } from "@/lib/pastes/rows"
import { profilePath } from "@/lib/profile-path"
import { RowMenu } from "./row-menu"
import { type RowSelection, SelectAllHead, SelectCell } from "./selection"

// Visibility as a quiet outlined label with an icon, so a column of them doesn't shout. Burn after
// read keeps the blue, since it is the one that changes what happens to the paste.
export function RowBadge({
  row,
  short = false,
  className,
}: {
  row: Pick<PasteRow, "visibility" | "burnAfterRead">
  // The mobile list has room for "Burn" only.
  short?: boolean
  className?: string
}) {
  const t = useTranslations("Workspace")
  const base = cn("h-6 gap-1.5 px-2 text-xs font-normal [&_svg]:size-3", className)
  if (row.burnAfterRead)
    return (
      <Badge variant="muted" className={cn(base, "border-link/40 text-link")}>
        <FlameIcon aria-hidden="true" />
        {short ? t("burn") : t("burn_after_read")}
      </Badge>
    )
  const Icon =
    row.visibility === "public" ? GlobeIcon : row.visibility === "private" ? LockIcon : LinkIcon
  return (
    <Badge variant="muted" className={cn(base, "text-foreground/80")}>
      <Icon aria-hidden="true" className="text-muted-foreground" />
      {t(row.visibility)}
    </Badge>
  )
}

// Visibility folded into a mobile row's meta line: a 12px icon before the slug, named for screen
// readers. Burn after read keeps its blue flame.
export function VisibilityIcon({ row }: { row: Pick<PasteRow, "visibility" | "burnAfterRead"> }) {
  const t = useTranslations("Workspace")
  const Icon = row.burnAfterRead
    ? FlameIcon
    : row.visibility === "public"
      ? GlobeIcon
      : row.visibility === "private"
        ? LockIcon
        : LinkIcon
  return (
    <>
      <Icon
        aria-hidden="true"
        className={cn("size-3 shrink-0", row.burnAfterRead ? "text-link" : "text-muted-foreground")}
      />
      <span className="sr-only">
        {row.burnAfterRead ? t("burn_after_read") : t(row.visibility)}
      </span>
    </>
  )
}

export function expiryClass(row: Pick<PasteRow, "expiresSoon" | "expiresAt">) {
  return row.expiresSoon ? "text-link" : undefined
}

export function ExpiryLabel({ row, mobile = false }: { row: PasteRow; mobile?: boolean }) {
  const expired = usePasteExpired(row.expiresAt)
  const coreT = useTranslations("Core")
  const t = useTranslations("Workspace")
  if (expired) return <span className="font-medium text-muted-foreground">{coreT("expired")}</span>
  if (!mobile || row.burnAfterRead) return row.expiresLabel
  return row.expiresSoon
    ? t("expires_label", { time: row.expiresLabel })
    : t("views_count", { count: row.views })
}

export interface SortHeadProps {
  direction: SortDirection | null
  firstDirection: SortDirection
  onSort: (direction: SortDirection) => void
}

// The paste table shared by the Pastes, Starred and collection pages and the dashboard. Sorting
// and row selection are optional, so a short list can show the same columns without them.
export function PasteTable({
  rows,
  origin,
  sortHead,
  selection,
  action = "menu",
}: {
  rows: PasteRow[]
  origin: string
  sortHead?: (sort: PasteSort) => SortHeadProps
  selection?: RowSelection
  // Starred lists end each row in a filled star that unstars it.
  action?: "menu" | "unstar"
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const first = selection ? "pl-0" : undefined
  // Without sorting the headers need less room, so a dashboard widget fits without scrolling on a
  // laptop screen.
  const compact = !sortHead

  const head = (sort: PasteSort, label: string, className?: string, alignEnd = false) =>
    sortHead ? (
      <TableSortHead {...sortHead(sort)} alignEnd={alignEnd} className={className}>
        {label}
      </TableSortHead>
    ) : (
      <TableHead className={cn(alignEnd && "text-right", className)}>{label}</TableHead>
    )

  return (
    <Table
      className={cn("hidden table-fixed lg:table", compact ? "min-w-[880px]" : "min-w-[1040px]")}
    >
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {selection ? <SelectAllHead selection={selection} /> : null}
          {head("title", t("paste"), first)}
          {head("language", t("language"), compact ? "w-[130px]" : "w-[140px]")}
          {head("visibility", t("visibility"), compact ? "w-[140px]" : "w-[160px]")}
          {head("views", t("views"), compact ? "w-20" : "w-24", true)}
          {head("expires", t("expires"), compact ? "w-[120px]" : "w-[140px]")}
          {head("updated", t("updated"), compact ? "w-[116px]" : "w-[140px]")}
          <TablePinnedHead className="w-16">
            <span className="sr-only">{t("actions")}</span>
          </TablePinnedHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.slug}
            data-selected={selection?.has(row.slug)}
            className="relative [&>td]:h-11"
          >
            {selection ? (
              <SelectCell selection={selection} rowKey={row.slug} name={row.title} />
            ) : null}
            <TableCell className={cn("truncate", first)}>
              <Link
                href={`/pastes/${row.slug}`}
                title={row.title}
                className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
              >
                {row.title}
              </Link>
            </TableCell>
            <TableCell className="text-[13px] text-foreground/80">
              <LanguageLabel language={row.language} />
            </TableCell>
            <TableCell>
              <RowBadge row={row} />
            </TableCell>
            <TableCell className="text-right font-mono text-[13px] tabular-nums">
              {formatNumber(row.views, locale)}
            </TableCell>
            <TableCell className={cn("text-[13px] text-foreground/80", expiryClass(row))}>
              <ExpiryLabel row={row} />
            </TableCell>
            <TableCell className="text-[13px] text-muted-foreground">{row.updatedLabel}</TableCell>
            <TablePinnedCell className="text-center">
              {action === "unstar" ? (
                <UnstarButton row={row} />
              ) : (
                <RowMenu row={row} origin={origin} />
              )}
            </TablePinnedCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function UnstarButton({ row }: { row: PasteRow }) {
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  return (
    <button
      type="button"
      aria-label={t("unstar_named", { name: row.title })}
      onClick={async () => {
        await setStarred(row.slug, false)
        showUndo({
          labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
          message: t("removed_from_starred_named", { name: row.title }),
          undo: () => setStarred(row.slug, true),
        })
      }}
      className="rounded-md relative z-10 inline-flex size-7 items-center justify-center text-highlight outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <StarIcon className="size-4 fill-current" />
    </button>
  )
}

// The same rows on phones: a language logo, the title and one meta line, ending in a menu button.
export function PasteMobileList({ rows, origin }: { rows: PasteRow[]; origin: string }) {
  return (
    <ul className="flex flex-col lg:hidden">
      {rows.map((row) => (
        <li key={row.slug} className="relative flex items-center gap-3 border-b border-border py-3">
          <LanguageIcon language={row.language} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link
              href={`/pastes/${row.slug}`}
              title={row.title}
              className="truncate text-[15px] font-medium after:absolute after:inset-0"
            >
              {row.title}
            </Link>
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
                expiryClass(row),
              )}
            >
              <VisibilityIcon row={row} />
              {row.owner?.handle ? (
                // Above the row's stretched link, so it opens the owner's profile.
                <a
                  href={`${origin}${profilePath(row.owner.handle)}`}
                  className="relative z-10 min-w-0 truncate font-mono hover:underline"
                >
                  @{row.owner.username}
                </a>
              ) : (
                <span className="min-w-0 truncate font-mono">
                  {row.owner ? `@${row.owner.username}` : row.slug}
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span className="shrink-0">
                <ExpiryLabel row={row} mobile />
              </span>
            </span>
          </div>
          <RowMenu row={row} origin={origin} variant="sheet" />
        </li>
      ))}
    </ul>
  )
}
