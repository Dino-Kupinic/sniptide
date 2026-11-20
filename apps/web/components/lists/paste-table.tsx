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
import {
  FlameIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  PlugIcon,
  StarIcon,
  TerminalIcon,
} from "lucide-react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { AgentLogo } from "@/components/onboarding/agent-logos"
import { usePasteExpired } from "@/components/paste/expiry-status"
import { LanguageLabel } from "@/components/paste/language-icon"
import { showUndo } from "@/components/undo-toast"
import { formatNumber } from "@/lib/format"
import { setStarred } from "@/lib/pastes/actions"
import { getLanguage } from "@/lib/pastes/languages"
import type { PasteSort, SortDirection } from "@/lib/pastes/list-query"
import type { PasteRow } from "@/lib/pastes/rows"
import { profilePath } from "@/lib/profile-path"
import { SkeletonTableRows } from "./list-skeleton"
import { MobileRow } from "./mobile-row"
import { RowMenu } from "./row-menu"
import { type RowSelection, SelectAllHead, SelectCell } from "./selection"

// Visibility as a quiet outlined label with an icon, so a column of them doesn't shout. Burn after
// read keeps the blue, since it is the one that changes what happens to the paste.
function RowBadge({
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

export function ExpiryLabel({ row }: { row: PasteRow }) {
  const expired = usePasteExpired(row.expiresAt)
  const coreT = useTranslations("Core")
  if (expired) return <span className="font-medium text-muted-foreground">{coreT("expired")}</span>
  return row.expiresLabel
}

// The logo of the agent that created a paste, or a terminal or plug for the CLI and the API, named
// for screen readers and on hover. Pastes from the web editor show nothing.
function CreatorMark({
  createdBy,
  className,
}: {
  createdBy: PasteRow["createdBy"]
  className?: string
}) {
  const t = useTranslations("Workspace")
  const clients = useTranslations("Onboarding.agent.clients")
  if (!createdBy) return null
  const label = createdBy.agent
    ? t("created_by_agent", {
        name: createdBy.agent === "other" ? t("an_agent") : clients(createdBy.agent),
      })
    : createdBy.via === "cli"
      ? t("created_with_cli")
      : createdBy.via === "mcp"
        ? t("created_with_mcp")
        : t("created_with_api")
  const mark = cn("size-3.5 shrink-0 text-muted-foreground", className)
  return (
    <span title={label} className="relative z-10 inline-flex shrink-0">
      {createdBy.agent ? (
        <AgentLogo client={createdBy.agent} className={mark} />
      ) : createdBy.via === "cli" ? (
        <TerminalIcon aria-hidden="true" className={mark} />
      ) : (
        <PlugIcon aria-hidden="true" className={mark} />
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
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
  className,
  selection,
  action = "menu",
  loadingRows,
}: {
  rows: PasteRow[]
  origin: string
  className?: string
  // While the rows are loading: how many placeholder rows stand in for them.
  loadingRows?: number
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
      className={cn(
        "table-fixed",
        className ?? "hidden lg:table",
        compact ? "min-w-[880px]" : "min-w-[1040px]",
      )}
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
        {loadingRows !== undefined ? (
          <SkeletonTableRows
            rows={loadingRows}
            cells={["w-20", "w-[72px]", "ml-auto w-8", "w-12", "w-20"]}
            rowClassName="[&>td]:h-11"
          />
        ) : null}
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
              <span className="flex min-w-0 items-center gap-2">
                <Link
                  href={`/pastes/${row.slug}`}
                  title={row.title}
                  className="block min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                >
                  {row.title}
                </Link>
                <CreatorMark createdBy={row.createdBy} />
              </span>
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
// The phone list: iOS rows with the language logo on a tile, the title, and one line with the
// language and when the paste changed, or how it runs out when that is what matters.
export function PasteMobileList({
  rows,
  origin,
  className,
}: {
  rows: PasteRow[]
  origin: string
  className?: string
}) {
  return (
    <ul className={cn("-mx-4 flex-col", className ?? "flex lg:hidden")}>
      {rows.map((row) => (
        <PasteMobileRow key={row.slug} row={row} origin={origin} />
      ))}
    </ul>
  )
}

function PasteMobileRow({ row, origin }: { row: PasteRow; origin: string }) {
  const t = useTranslations("Workspace")
  const coreT = useTranslations("Core")
  const expired = usePasteExpired(row.expiresAt)
  const detail = row.burnAfterRead ? (
    <span className="truncate text-link">{t("burn_after_read")}</span>
  ) : (
    <>
      <span className="shrink-0">{getLanguage(row.language).name}</span>
      {row.owner ? (
        <>
          <span aria-hidden="true">·</span>
          {row.owner.handle ? (
            // Above the row's stretched link, so it opens the owner's profile.
            <a
              href={`${origin}${profilePath(row.owner.handle)}`}
              className="relative z-10 min-w-0 truncate hover:underline"
            >
              @{row.owner.username}
            </a>
          ) : (
            <span className="min-w-0 truncate">@{row.owner.username}</span>
          )}
        </>
      ) : null}
      <span aria-hidden="true">·</span>
      <span className={cn("truncate", expired ? "font-medium" : expiryClass(row))}>
        {expired
          ? coreT("expired")
          : row.expiresSoon
            ? t("expires_label", { time: row.expiresLabel })
            : row.updatedLabel}
      </span>
    </>
  )
  return (
    <MobileRow
      href={`/pastes/${row.slug}`}
      language={row.language}
      title={row.title}
      detail={
        <>
          <CreatorMark createdBy={row.createdBy} className="mr-0.5 size-3.5 shrink-0" />
          {detail}
        </>
      }
    />
  )
}
