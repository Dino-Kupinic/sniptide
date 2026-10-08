"use client"

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import { Trash2Icon } from "lucide-react"
import * as React from "react"
import { LanguageLabel, LanguageMarker } from "@/components/paste/language-marker"
import { deleteForever, emptyTrash, restorePaste } from "@/lib/pastes/actions"
import type { TrashRow } from "@/lib/pastes/rows"
import { ListHeader, SearchField } from "./toolbar"

function ConfirmDelete({
  title,
  description,
  confirmLabel,
  onConfirm,
  trigger,
}: {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  trigger: React.ReactElement
}) {
  const [pending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" size="lg" />}>
            Cancel
          </AlertDialogClose>
          <Button
            size="lg"
            className="bg-destructive text-white hover:bg-destructive/85"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await onConfirm()
                setOpen(false)
              })
            }
          >
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RestoreButton({ slug, className }: { slug: string; className?: string }) {
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => restorePaste(slug))}
      className={cn("h-[30px] px-3 text-[13px]", className)}
    >
      Restore
    </Button>
  )
}

export function TrashList({
  rows,
  sizeLabel,
  host,
}: {
  rows: TrashRow[]
  sizeLabel: string
  host: string
}) {
  const [query, setQuery] = React.useState("")
  const needle = query.trim().toLowerCase()
  const filtered = rows.filter(
    (row) =>
      !needle ||
      row.title.toLowerCase().includes(needle) ||
      row.slug.toLowerCase().includes(needle),
  )

  const emptyButton = (variant: "desktop" | "mobile") => (
    <ConfirmDelete
      title="Empty trash?"
      description={`${rows.length} ${rows.length === 1 ? "paste" : "pastes"} will be deleted for good. This can't be undone.`}
      confirmLabel="Empty trash"
      onConfirm={emptyTrash}
      trigger={
        variant === "desktop" ? (
          <Button
            variant="outline"
            size="lg"
            disabled={rows.length === 0}
            className="border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2Icon />
            Empty trash
          </Button>
        ) : (
          <button
            type="button"
            disabled={rows.length === 0}
            className="shrink-0 text-sm text-destructive disabled:opacity-50"
          >
            Empty trash
          </button>
        )
      }
    />
  )

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title="Trash"
        count={rows.length}
        description="Deleted pastes stay here for 30 days. Their links stop working right away."
        actions={emptyButton("desktop")}
      />

      <div className="flex flex-col gap-3 lg:hidden">
        <SearchField value={query} onChange={setQuery} placeholder="Search deleted pastes" />
        <div className="flex items-center justify-between gap-4 border border-border bg-sidebar px-4 py-3 text-[13px] text-foreground/80">
          <p>Deleted pastes are kept for 30 days. Their links no longer work.</p>
          {emptyButton("mobile")}
        </div>
      </div>

      <div className="flex flex-col lg:border lg:border-border">
        {filtered.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">
            {query ? "No deleted pastes match." : "Trash is empty."}
          </p>
        ) : (
          <>
            <Table className="hidden table-fixed lg:table">
              <TableHeader className="bg-sidebar">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Paste</TableHead>
                  <TableHead className="w-[130px]">Language</TableHead>
                  <TableHead className="w-[130px]">Deleted</TableHead>
                  <TableHead className="w-[206px]">Gone for good</TableHead>
                  <TableHead className="w-[136px]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.slug} className="border-border/60">
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
                          title="Delete forever?"
                          description={`"${row.title}" will be deleted for good. This can't be undone.`}
                          confirmLabel="Delete forever"
                          onConfirm={() => deleteForever(row.slug)}
                          trigger={
                            <button
                              type="button"
                              aria-label={`Delete ${row.title} forever`}
                              className="flex size-[30px] items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40"
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
              {filtered.map((row) => (
                <li key={row.slug} className="flex items-center gap-3 border-b border-border py-3">
                  <LanguageMarker language={row.language} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] text-foreground/70">{row.title}</span>
                    <span
                      className={cn(
                        "text-[13px] text-muted-foreground",
                        row.goneSoon && "text-destructive",
                      )}
                    >
                      Deleted{" "}
                      {row.deletedLabel.toLowerCase() === "today" ? "today" : row.deletedLabel} ·
                      gone {row.goneLabel}
                    </span>
                  </div>
                  <RestoreButton slug={row.slug} className="h-8" />
                </li>
              ))}
            </ul>

            <p className="hidden border-t border-border px-4 py-3 text-[13px] text-muted-foreground lg:block">
              {rows.length} {rows.length === 1 ? "paste" : "pastes"} · {sizeLabel}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
