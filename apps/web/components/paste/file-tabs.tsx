"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { cn } from "@sniptide/ui/lib/utils"
import { CodeIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { LanguageIcon } from "@/components/paste/language-icon"
import { detectLanguage } from "@/lib/pastes/languages"

export interface EditorFile {
  id: string
  name: string
  content: string
}

// The paste editor's file tabs: pick, rename (double-click, or right after adding), remove and add.
// Touch has no reliable double-click, so tapping the tab that is already open shows a menu with
// Rename, Change language and Remove.
export function FileTabs({
  files,
  activeId,
  onSelect,
  onRename,
  onRemove,
  onAdd,
  onChangeLanguage,
  trailing,
}: {
  files: EditorFile[]
  activeId: string | undefined
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  // Adds a file and returns its id, which then opens for renaming.
  onAdd: () => string
  // Opens the language picker for the active file (from the touch menu).
  onChangeLanguage?: () => void
  // Pinned to the right end of the bar (the side panel toggle).
  trailing?: React.ReactNode
}) {
  const t = useTranslations("Paste")
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [menuId, setMenuId] = React.useState<string | null>(null)
  // The pointer behind the last press, so a tap on the open tab can show its menu while a mouse
  // click keeps desktop behaviour.
  const pointer = React.useRef("mouse")

  return (
    <div
      role="tablist"
      aria-label={t("files")}
      className="flex h-11 shrink-0 overflow-x-auto border-b border-border bg-sidebar"
    >
      {files.map((file) => {
        const selected = file.id === activeId
        return (
          <div
            key={file.id}
            className={cn(
              "flex shrink-0 items-center gap-2 border-r border-border px-3.5",
              selected && "bg-background shadow-[inset_0_-2px_0_var(--primary)]",
            )}
          >
            <LanguageIcon language={detectLanguage(file.name).id} />
            {renamingId === file.id ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: renaming starts right after the user asks for it
                autoFocus
                aria-label={t("fileName")}
                defaultValue={file.name}
                onFocus={(event) => {
                  // Select the name without its extension, like a file manager would.
                  const dot = file.name.lastIndexOf(".")
                  event.currentTarget.setSelectionRange(0, dot > 0 ? dot : file.name.length)
                }}
                onBlur={(event) => {
                  const name = event.target.value.trim()
                  if (name) onRename(file.id, name)
                  setRenamingId(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                  if (event.key === "Escape") setRenamingId(null)
                }}
                className="w-36 bg-transparent font-mono text-[13px] outline-none"
              />
            ) : (
              <DropdownMenu
                open={menuId === file.id}
                onOpenChange={(open) => {
                  if (!open) setMenuId(null)
                }}
              >
                <DropdownMenuTrigger
                  render={<button type="button" />}
                  role="tab"
                  aria-selected={selected}
                  aria-describedby="rename-hint"
                  onPointerDown={(event) => {
                    pointer.current = event.pointerType
                  }}
                  onClick={() => {
                    if (selected && pointer.current !== "mouse") setMenuId(file.id)
                    else onSelect(file.id)
                  }}
                  onDoubleClick={() => setRenamingId(file.id)}
                  className={cn(
                    "self-stretch font-mono text-[13px] outline-none focus-visible:underline",
                    selected ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {file.name}
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    className="h-10"
                    onClick={() => {
                      setMenuId(null)
                      setRenamingId(file.id)
                    }}
                  >
                    <PencilIcon />
                    {t("rename")}
                  </DropdownMenuItem>
                  {onChangeLanguage ? (
                    <DropdownMenuItem className="h-10" onClick={onChangeLanguage}>
                      <CodeIcon />
                      {t("changeLanguage")}
                    </DropdownMenuItem>
                  ) : null}
                  {files.length > 1 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        className="h-10"
                        onClick={() => onRemove(file.id)}
                      >
                        <Trash2Icon />
                        {t("removeFileAction")}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {selected && files.length > 1 ? (
              <button
                type="button"
                aria-label={t("removeFile", { name: file.name })}
                onClick={() => onRemove(file.id)}
                className="inline-flex items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 max-lg:-mr-2 max-lg:size-8"
              >
                <XIcon className="size-3" strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        )
      })}
      <span id="rename-hint" className="sr-only">
        {t("renameHint")}
      </span>
      {files.length < 10 ? (
        <button
          type="button"
          onClick={() => setRenamingId(onAdd())}
          className="flex shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <PlusIcon className="size-3.5" />
          <span className="hidden lg:inline">{t("addFile")}</span>
        </button>
      ) : null}
      {trailing ? (
        <div className="sticky right-0 ml-auto flex shrink-0 items-center bg-sidebar pr-1.5">
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
