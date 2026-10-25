"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@sniptide/ui/components/alert-dialog"
import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TablePinnedCell,
  TablePinnedHead,
  TableRow,
  TableSortHead,
} from "@sniptide/ui/components/table"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { ArchiveRestoreIcon, Trash2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { LanguageIcon, LanguageLabel } from "@/components/paste/language-icon"
import { runAction } from "@/lib/feedback"
import { formatNumber } from "@/lib/format"
import { deleteForever, emptyTrash, restorePaste } from "@/lib/pastes/actions"
import {
  DEFAULT_SORT_DIRECTION,
  PASTE_PAGE_SIZE,
  type PageInfo,
  type PasteListQuery,
  type PasteSort,
  pasteListSearch,
  type SortDirection,
  sortDirection,
} from "@/lib/pastes/list-query"
import type { TrashRow } from "@/lib/pastes/rows"
import { ActionSheet } from "./row-menu"
import { ListHeader, Pagination, SearchField } from "./toolbar"
import { useListQuery } from "./use-list-query"

function ConfirmDelete({
  title,
  description,
  confirmLabel,
  successMessage,
  onConfirm,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  title: string
  description: string
  confirmLabel: string
  successMessage: string
  onConfirm: () => Promise<void>
  // Without a trigger the caller opens it, as the mobile row sheet does.
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("Workspace")
  const [pending, startTransition] = React.useTransition()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [error, setError] = React.useState<string | null>(null)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setError(null)
      }}
    >
      {trigger ? <AlertDialogTrigger render={trigger} /> : null}
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <FormError variant="inline" message={error} />
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" size="lg" />}>
            {t("cancel")}
          </AlertDialogClose>
          <Button
            variant="destructive"
            size="lg"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await onConfirm()
                } catch {
                  return setError(t("couldnt_delete_try_again"))
                }
                toast.success(successMessage)
                setOpen(false)
              })
            }
          >
            {pending ? t("deleting") : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RestoreButton({ slug, className }: { slug: string; className?: string }) {
  const t = useTranslations("Workspace")
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await runAction(() => restorePaste(slug), {
            success: t("paste_restored"),
            error: t("couldnt_restore_the_paste_try_again"),
          })
        })
      }
      className={cn("h-[30px] px-3 text-[13px]", className)}
    >
      {t("restore")}
    </Button>
  )
}

// A mobile trash row's ⋯ sheet: Restore, and Delete forever behind the same confirmation as the
// desktop table's button.
function TrashRowMenu({ row }: { row: TrashRow }) {
  const t = useTranslations("Workspace")
  const [confirming, setConfirming] = React.useState(false)
  return (
    <>
      <ActionSheet
        title={row.title}
        label={t("actions_for", { name: row.title })}
        actions={[
          {
            id: "restore",
            icon: ArchiveRestoreIcon,
            label: t("restore"),
            onSelect: () =>
              runAction(() => restorePaste(row.slug), {
                success: t("paste_restored"),
                error: t("couldnt_restore_the_paste_try_again"),
              }),
          },
          {
            id: "delete",
            icon: Trash2Icon,
            label: t("delete_forever"),
            destructive: true,
            group: true,
            onSelect: () => setConfirming(true),
          },
        ]}
      />
      <ConfirmDelete
        title={t("delete_forever_title")}
        description={t("delete_paste_description", { name: row.title })}
        confirmLabel={t("delete_forever")}
        successMessage={t("paste_deleted")}
        onConfirm={() => deleteForever(row.slug)}
        open={confirming}
        onOpenChange={setConfirming}
      />
    </>
  )
}

export function TrashList({
  rows,
  sizeLabel,
  host,
  query: serverQuery,
  pagination,
}: {
  rows: TrashRow[]
  sizeLabel: string
  host: string
  query: PasteListQuery
  pagination: PageInfo
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  const { query, update, pending } = useListQuery(serverQuery, pasteListSearch)
  const start = (pagination.page - 1) * PASTE_PAGE_SIZE
  // The trash sorts by title, language and deletion time. "Deleted" and "Gone for good" are the
  // same order, so both headers share the one sort and show the same arrow.
  const sort: PasteSort =
    query.sort === "title" || query.sort === "language" ? query.sort : "updated"
  const direction = sortDirection({ sort, dir: query.dir })
  const headProps = (value: PasteSort, firstDirection = DEFAULT_SORT_DIRECTION[value]) => ({
    direction: sort === value ? direction : null,
    firstDirection,
    onSort: (next: SortDirection) =>
      update({ sort: value, dir: next === DEFAULT_SORT_DIRECTION[value] ? undefined : next }),
  })

  const empty = pagination.totalAll === 0
  const emptyButton = (variant: "desktop" | "mobile") => (
    <ConfirmDelete
      title={t("empty_trash_title")}
      description={t("empty_trash_description", { count: pagination.totalAll })}
      confirmLabel={t("empty_trash")}
      successMessage={t("trash_emptied")}
      onConfirm={emptyTrash}
      trigger={
        variant === "desktop" ? (
          <Button variant="destructive" size="lg" disabled={empty}>
            <Trash2Icon />
            {t("empty_trash")}
          </Button>
        ) : (
          <Button variant="destructive" size="xl">
            <Trash2Icon />
            {t("empty_trash")}
          </Button>
        )
      }
    />
  )

  return (
    <div aria-busy={pending} className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={t("trash")}
        count={pagination.totalAll}
        actions={emptyButton("desktop")}
        mobileActions={empty ? null : emptyButton("mobile")}
      />

      {/* An empty trash shows its one sentence and nothing to search. */}
      {empty ? null : (
        <div className="flex flex-col gap-3 lg:hidden">
          <SearchField
            value={query.q}
            onChange={(q) => update({ q }, true)}
            placeholder={t("search_deleted_pastes")}
          />
          <p className="text-[13px] text-muted-foreground">
            {t("deleted_pastes_are_kept_for_30_days_their")}
          </p>
        </div>
      )}

      <div className="lg:overflow-hidden lg:rounded-lg flex flex-col lg:border lg:border-border">
        {pagination.total === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">
            {query.q ? t("no_deleted_pastes_match") : t("trash_is_empty")}
          </p>
        ) : (
          <>
            <Table className="hidden min-w-[960px] table-fixed lg:table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableSortHead {...headProps("title")}>{t("paste")}</TableSortHead>
                  <TableSortHead {...headProps("language")} className="w-[140px]">
                    {t("language")}
                  </TableSortHead>
                  <TableSortHead {...headProps("updated")} className="w-[140px]">
                    {t("deleted")}
                  </TableSortHead>
                  <TableSortHead {...headProps("updated", "asc")} className="w-[200px]">
                    {t("gone_for_good")}
                  </TableSortHead>
                  <TablePinnedHead className="w-[148px]">
                    <span className="sr-only">{t("actions")}</span>
                  </TablePinnedHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.slug}>
                    <TableCell className="truncate">
                      <span className="block truncate text-sm text-foreground/70">{row.title}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground/80 line-through">
                        {host}/{row.slug}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] text-foreground/80">
                      <LanguageLabel language={row.language} />
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {row.deletedLabel}
                    </TableCell>
                    <TableCell>
                      <span className={cn("block text-[13px]", row.goneSoon && "text-destructive")}>
                        {row.goneLabel}
                      </span>
                      <span aria-hidden="true" className="mt-1 block h-[3px] w-[120px] bg-border">
                        <span
                          style={{ width: `${Math.max(4, row.remaining * 100)}%` }}
                          className={cn(
                            "block h-full bg-foreground",
                            row.goneSoon && "bg-destructive",
                          )}
                        />
                      </span>
                    </TableCell>
                    <TablePinnedCell>
                      <div className="flex items-center justify-end gap-1">
                        <RestoreButton slug={row.slug} />
                        <ConfirmDelete
                          title={t("delete_forever_title")}
                          description={t("delete_paste_description", { name: row.title })}
                          confirmLabel={t("delete_forever")}
                          successMessage={t("paste_deleted")}
                          onConfirm={() => deleteForever(row.slug)}
                          trigger={
                            <Button
                              variant="destructive"
                              size="icon-sm"
                              aria-label={t("delete_named_forever", { name: row.title })}
                            >
                              <Trash2Icon />
                            </Button>
                          }
                        />
                      </div>
                    </TablePinnedCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <ul className="flex flex-col lg:hidden">
              {rows.map((row) => (
                <li key={row.slug} className="flex items-center gap-3 border-b border-border py-3">
                  <LanguageIcon language={row.language} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span title={row.title} className="truncate text-[15px] text-foreground/70">
                      {row.title}
                    </span>
                    <span
                      className={cn(
                        "text-[13px] text-muted-foreground",
                        row.goneSoon && "text-destructive",
                      )}
                    >
                      {t("trash_metadata", { deleted: row.deletedLabel, gone: row.goneLabel })}
                    </span>
                  </div>
                  <TrashRowMenu row={row} />
                </li>
              ))}
            </ul>

            <p className="hidden border-t border-border px-4 py-3 text-[13px] text-muted-foreground lg:block">
              {t("paste_count", { count: pagination.totalAll })} · {sizeLabel}
            </p>
          </>
        )}
      </div>
      {pagination.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>
            {t("pagination_summary", {
              range: `${formatNumber(start + 1, locale)}–${formatNumber(start + rows.length, locale)}`,
              total: formatNumber(pagination.total, locale),
            })}
          </span>
          <Pagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            onChange={(page) =>
              update({
                page,
                cursor:
                  page === pagination.page + 1
                    ? pagination.nextCursor
                    : page === pagination.page - 1
                      ? pagination.previousCursor
                      : undefined,
              })
            }
          />
        </div>
      ) : null}
    </div>
  )
}
