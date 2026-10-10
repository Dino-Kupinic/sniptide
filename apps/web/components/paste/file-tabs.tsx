"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { PlusIcon, XIcon } from "lucide-react"
import * as React from "react"
import { LanguageMarker } from "@/components/paste/language-marker"
import { detectLanguage } from "@/lib/pastes/languages"

export interface EditorFile {
  id: string
  name: string
  content: string
}

// The paste editor's file tabs: pick, rename (double-click, or right after adding), remove and add.
export function FileTabs({
  files,
  activeId,
  onSelect,
  onRename,
  onRemove,
  onAdd,
  trailing,
}: {
  files: EditorFile[]
  activeId: string | undefined
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  // Adds a file and returns its id, which then opens for renaming.
  onAdd: () => string
  // Pinned to the right end of the bar (the side panel toggle).
  trailing?: React.ReactNode
}) {
  const [renamingId, setRenamingId] = React.useState<string | null>(null)

  return (
    <div
      role="tablist"
      aria-label="Files"
      className="flex h-11 shrink-0 overflow-x-auto border-b border-border bg-sidebar"
    >
      {files.map((file) => {
        const selected = file.id === activeId
        return (
          <div
            key={file.id}
            className={cn(
              "flex shrink-0 items-center gap-2 border-r border-border px-3.5",
              selected && "bg-background shadow-[inset_0_2px_0_var(--primary)]",
            )}
          >
            <LanguageMarker language={detectLanguage(file.name).id} />
            {renamingId === file.id ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: renaming starts right after the user asks for it
                autoFocus
                aria-label="File name"
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
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                aria-describedby="rename-hint"
                onClick={() => onSelect(file.id)}
                onDoubleClick={() => setRenamingId(file.id)}
                className={cn(
                  "font-mono text-[13px] outline-none focus-visible:underline",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {file.name}
              </button>
            )}
            {selected && files.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onRemove(file.id)}
                className="text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <XIcon className="size-3" strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        )
      })}
      <span id="rename-hint" className="sr-only">
        Double-click to rename
      </span>
      {files.length < 10 ? (
        <button
          type="button"
          onClick={() => setRenamingId(onAdd())}
          className="flex shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <PlusIcon className="size-3.5" />
          <span className="hidden lg:inline">Add file</span>
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
