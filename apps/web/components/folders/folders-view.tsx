"use client"

import { Button } from "@sniptide/ui/components/button"
import { FolderIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import * as React from "react"
import { ListHeader } from "@/components/lists/toolbar"
import { flattenTree } from "@/lib/folders/tree"
import type { Folder } from "@/lib/folders/types"
import { FolderMenu } from "./folder-menu"
import { NewFolderDialog } from "./new-folder"

// The Folders page: every folder as a tree with its paste count, and the way to make a new one.
// It is also where phones, which have no sidebar, manage folders.
export function FoldersView({ folders }: { folders: Folder[] }) {
  const t = useTranslations("Workspace")
  const [creating, setCreating] = React.useState(false)
  const create = (
    <Button size="lg" onClick={() => setCreating(true)}>
      <PlusIcon />
      {t("new_folder")}
    </Button>
  )

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <ListHeader
        title={t("folders")}
        count={folders.length}
        description={t("folders_description")}
        actions={create}
      />
      <div className="lg:hidden">{create}</div>

      {folders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-border px-4 py-14 text-center text-sm text-muted-foreground">
          {t("no_folders_yet")}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="font-medium text-link hover:underline"
          >
            {t("create_your_first_folder")}
          </button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border border border-border">
          {flattenTree(folders).map(({ folder, depth }) => (
            <li
              key={folder.id}
              style={{ paddingLeft: 16 + depth * 20 }}
              className="relative flex items-center gap-3 py-3 pr-4 hover:bg-muted/50"
            >
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
              <Link
                href={`/folders/${folder.id}`}
                className="min-w-0 flex-1 truncate text-sm outline-none after:absolute after:inset-0 focus-visible:underline"
              >
                {folder.name}
              </Link>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("paste_count", { count: folder.pasteCount })}
              </span>
              <FolderMenu
                folder={folder}
                folders={folders}
                className="relative z-10 flex size-8 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
              />
            </li>
          ))}
        </ul>
      )}

      <NewFolderDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
