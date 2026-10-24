"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@sniptide/ui/components/dialog"
import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, FolderIcon, HomeIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { moveFolder } from "@/lib/folders/actions"
import { checkMove, flattenTree, type MoveCheck } from "@/lib/folders/tree"
import type { Folder } from "@/lib/folders/types"

const reasons = {
  same: "move_reason_same",
  cycle: "move_reason_cycle",
  depth: "move_reason_depth",
  duplicate: "move_reason_duplicate",
} as const satisfies Partial<Record<MoveCheck, string>>

// Pick the folder (or the top level) to move a folder under. Destinations the folder can't go to
// are shown disabled with the reason, using the same rules the server applies.
// Mounted when opened, so cancelling discards the choice.
export function MoveFolderDialog({
  folder,
  folders,
  onOpenChange,
}: {
  folder: Folder
  folders: Folder[]
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Workspace")
  const router = useRouter()
  const [target, setTarget] = React.useState<string | null | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const options = [
    { id: null, name: t("move_top_level"), depth: 0, icon: HomeIcon },
    ...flattenTree(folders).map((option) => ({
      id: option.folder.id as string | null,
      name: option.folder.name,
      depth: option.depth + 1,
      icon: FolderIcon,
    })),
  ]

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t("move_folder_title", { name: folder.name })}</DialogTitle>
        <DialogDescription>{t("move_folder_description")}</DialogDescription>
        <fieldset className="min-w-0 flex max-h-72 flex-col overflow-y-auto border border-border">
          <legend className="sr-only">{t("move_destination")}</legend>
          {options.map((option) => {
            const check = checkMove(folders, folder.id, option.id)
            const disabled = check !== "ok"
            const selected = target === option.id
            return (
              <button
                key={option.id ?? "top"}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => setTarget(option.id)}
                style={{ paddingLeft: 12 + option.depth * 16 }}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 pr-3 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset disabled:opacity-50 disabled:hover:bg-transparent [&_svg]:size-4",
                  selected && "bg-muted font-medium",
                )}
              >
                <option.icon className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {disabled ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t(reasons[check])}
                  </span>
                ) : null}
                {selected ? <CheckIcon className="text-primary" /> : null}
              </button>
            )
          })}
        </fieldset>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
            {t("cancel")}
          </DialogClose>
          <Button
            size="lg"
            disabled={pending || target === undefined}
            onClick={() =>
              startTransition(async () => {
                if (target === undefined) return
                const result = await moveFolder(folder.id, target)
                if (!result.ok) return setError(result.error)
                onOpenChange(false)
                router.refresh()
              })
            }
          >
            {pending ? t("moving") : t("move_here")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
