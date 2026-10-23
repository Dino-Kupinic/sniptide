"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTrigger,
  sheetRowClass,
} from "@sniptide/ui/components/sheet"
import { cn } from "@sniptide/ui/lib/utils"
import {
  CopyIcon,
  ExternalLinkIcon,
  LinkIcon,
  LogOutIcon,
  type LucideIcon,
  MoreHorizontalIcon,
  PencilIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { withUndo } from "@/components/undo-toast"
import { copyText, runAction } from "@/lib/feedback"
import {
  leaveShare,
  restorePaste,
  restoreShare,
  setStarred,
  trashPaste,
} from "@/lib/pastes/actions"
import type { PasteRow } from "@/lib/pastes/rows"

// One entry of a row's menu. The desktop dropdown and the mobile sheet render the same list.
export interface RowAction {
  id: string
  icon: LucideIcon
  label: string
  href?: string
  onSelect?: () => void
  destructive?: boolean
  // Starts a new group below a divider.
  group?: boolean
}

function useRowActions(row: PasteRow, origin: string, shared: boolean): RowAction[] {
  const t = useTranslations("Workspace")
  const feedbackT = useTranslations("Core")
  const actions: RowAction[] = [
    { id: "open", icon: ExternalLinkIcon, label: t("open"), href: `/pastes/${row.slug}` },
    {
      id: "copy",
      icon: LinkIcon,
      label: t("copy_link"),
      onSelect: () =>
        copyText(`${origin}/${row.slug}`, {
          success: feedbackT("linkCopied"),
          error: feedbackT("copyError"),
        }),
    },
  ]
  if (row.canEdit)
    actions.push({
      id: "edit",
      icon: PencilIcon,
      label: t("edit"),
      href: `/pastes/${row.slug}/edit`,
    })
  actions.push(
    { id: "duplicate", icon: CopyIcon, label: t("duplicate"), href: `/new?from=${row.slug}` },
    {
      id: "star",
      icon: row.starred ? StarOffIcon : StarIcon,
      label: row.starred ? t("unstar") : t("star"),
      onSelect: () =>
        runAction(() => setStarred(row.slug, !row.starred), {
          success: row.starred ? t("removed_from_starred") : t("starred"),
          error: t("couldnt_update_the_star_try_again"),
        }),
    },
  )
  if (shared)
    actions.push({
      id: "leave",
      icon: LogOutIcon,
      label: t("remove_from_my_list"),
      destructive: true,
      group: true,
      onSelect: () =>
        withUndo(() => leaveShare(row.slug), {
          labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
          error: t("couldnt_remove_it_from_your_list_try_again"),
          message: t("removed_from_list", { name: row.title }),
          undo: () => restoreShare(row.slug),
        }),
    })
  if (!row.owner)
    actions.push({
      id: "trash",
      icon: Trash2Icon,
      label: t("move_to_trash"),
      destructive: true,
      group: true,
      onSelect: () =>
        withUndo(() => trashPaste(row.slug), {
          labels: { undo: feedbackT("undo"), error: feedbackT("undoError") },
          error: t("couldnt_move_the_paste_to_trash_try_again"),
          message: t("moved_to_trash", { name: row.title }),
          undo: () => restorePaste(row.slug),
        }),
    })
  return actions
}

// A paste row's ⋯ menu. `variant="sheet"` is the touch version for the mobile lists: a 40px
// trigger that sits above the row's stretched link and opens the actions as a bottom sheet.
export function RowMenu({
  row,
  origin,
  shared = false,
  variant = "menu",
}: {
  row: PasteRow
  origin: string
  // A row of Shared with me, which the viewer can drop from their list.
  shared?: boolean
  variant?: "menu" | "sheet"
}) {
  const t = useTranslations("Workspace")
  const actions = useRowActions(row, origin, shared)
  const label = t("actions_for", { name: row.title })

  if (variant === "sheet") return <ActionSheet title={row.title} label={label} actions={actions} />

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="rounded-md relative z-10 flex size-7 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <React.Fragment key={action.id}>
            {action.group ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : undefined}
              render={action.href ? <Link href={action.href} /> : undefined}
              onClick={action.onSelect}
            >
              <action.icon />
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The trailing ⋯ button of a mobile list row and the bottom sheet it opens. The 40px target sits
// above the row's stretched link and overhangs the row's end, so its icon lines up with the gutter.
export function ActionSheet({
  title,
  label,
  actions,
  className,
}: {
  title: string
  label: string
  actions: RowAction[]
  className?: string
}) {
  const t = useTranslations("Workspace")
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={label}
        className={cn(
          "rounded-lg relative z-10 -mr-2.5 flex size-10 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted",
          className,
        )}
      >
        <MoreHorizontalIcon className="size-4" />
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader title={title} closeLabel={t("close")} />
        <SheetBody>
          <ul className="flex flex-col">
            {actions.map((action) => {
              const rowClass = cn(
                sheetRowClass,
                action.destructive && "text-destructive [&_svg]:text-destructive",
              )
              const content = (
                <>
                  <action.icon aria-hidden="true" />
                  {action.label}
                </>
              )
              return (
                <li
                  key={action.id}
                  className={cn(action.group && "mt-1 border-t border-border pt-1")}
                >
                  {action.href ? (
                    <Link href={action.href} onClick={() => setOpen(false)} className={rowClass}>
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        action.onSelect?.()
                      }}
                      className={rowClass}
                    >
                      {content}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
