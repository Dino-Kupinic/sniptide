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
  TableHead,
  TableHeader,
  TableRow,
} from "@sniptide/ui/components/table"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { Trash2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { LanguageIcon, LanguageLabel } from "@/components/paste/language-icon"
import { runAction } from "@/lib/feedback"
import { formatNumber } from "@/lib/format"
import { deleteForever, emptyTrash, restorePaste } from "@/lib/pastes/actions"
import {
  PASTE_PAGE_SIZE,
  type PageInfo,
  type PasteListQuery,
  pasteListSearch,
} from "@/lib/pastes/list-query"
import type { TrashRow } from "@/lib/pastes/rows"
import { ListHeader, Pagination, SearchField } from "./toolbar"
import { useListQuery } from "./use-list-query"

function ConfirmDelete({
  title,
  description,
  confirmLabel,
  successMessage,
  onConfirm,
  trigger,
}: {
  title: string
  description: string
  confirmLabel: string
  successMessage: string
  onConfirm: () => Promise<void>
  trigger: React.ReactElement
}) {
  const t = useTranslations("Workspace")
  const [pending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setError(null)
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <FormError variant="inline" message={error} />
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" size="lg" />}>
            {t("cancel")}
          </AlertDialogClose>
          <Button
            size="lg"
            className="bg-destructive text-white hover:bg-destructive/85"
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

  const emptyButton = (variant: "desktop" | "mobile") => (
    <ConfirmDelete
      title={t("empty_trash_title")}
      description={t("empty_trash_description", { count: pagination.totalAll })}
      confirmLabel={t("empty_trash")}
      successMessage={t("trash_emptied")}
      onConfirm={emptyTrash}
      trigger={
        variant === "desktop" ? (
          <Button
            variant="outline"
            size="lg"
            disabled={pagination.totalAll === 0}
            className="border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2Icon />
            {t("empty_trash")}
          </Button>
        ) : (
          <button
            type="button"
            disabled={pagination.totalAll === 0}
            className="shrink-0 text-sm text-destructive disabled:opacity-50"
          >
            {t("empty_trash")}
          </button>
        )
      }
    />
  )

  return (
    <div aria-busy={pending} className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={t("trash")}
        count={pagination.totalAll}
        description={t("deleted_pastes_stay_here_for_30_days_their")}
        actions={emptyButton("desktop")}
      />

      <div className="flex flex-col gap-3 lg:hidden">
        <SearchField
          value={query.q}
          onChange={(q) => update({ q }, true)}
          placeholder={t("search_deleted_pastes")}
        />
        <div className="rounded-lg flex items-center justify-between gap-4 border border-border bg-sidebar px-4 py-3 text-[13px] text-foreground/80">
          <p>{t("deleted_pastes_are_kept_for_30_days_their")}</p>
          {emptyButton("mobile")}
        </div>
      </div>

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
                  <TableHead>{t("paste")}</TableHead>
                  <TableHead className="w-[130px]">{t("language")}</TableHead>
                  <TableHead className="w-[130px]">{t("deleted")}</TableHead>
                  <TableHead className="w-[206px]">{t("gone_for_good")}</TableHead>
                  <TableHead className="w-[136px]">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
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
                    <TableCell className="pr-3">
                      <div className="flex items-center justify-end gap-1">
                        <RestoreButton slug={row.slug} />
                        <ConfirmDelete
                          title={t("delete_forever_title")}
                          description={t("delete_paste_description", { name: row.title })}
                          confirmLabel={t("delete_forever")}
                          successMessage={t("paste_deleted")}
                          onConfirm={() => deleteForever(row.slug)}
                          trigger={
                            <button
                              type="button"
                              aria-label={t("delete_named_forever", { name: row.title })}
                              className="rounded-md flex size-[30px] items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                              <Trash2Icon className="size-4" />
                            </button>
                          }
                        />
                      </div>
                    </TableCell>
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
                  <RestoreButton slug={row.slug} className="h-8" />
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
