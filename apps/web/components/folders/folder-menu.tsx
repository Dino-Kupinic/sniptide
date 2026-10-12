"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import {
  FolderInputIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { depthOf, descendantIds } from "@/lib/folders/tree"
import { type Folder, MAX_FOLDER_DEPTH } from "@/lib/folders/types"
import { DeleteFolderDialog } from "./delete-folder"
import { MoveFolderDialog } from "./move-folder"
import { NewFolderDialog } from "./new-folder"
import { RenameFolderDialog } from "./rename-folder"

// New subfolder, rename, move and delete for one folder. `folders` is all of the viewer's, which
// the move and delete dialogs read to offer destinations and describe what's inside. Deleting
// while on the folder's page (or one inside it) leaves for the parent folder, which would
// otherwise be a 404.
export function FolderMenu({
  folder,
  folders,
  className,
}: {
  folder: Folder
  folders: Folder[]
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [dialog, setDialog] = React.useState<"new" | "rename" | "move" | "delete" | null>(null)
  const close = (open: boolean) => {
    if (!open) setDialog(null)
  }

  function afterDelete() {
    const inside = [folder.id, ...descendantIds(folders, folder.id)]
    if (inside.some((id) => pathname === `/folders/${id}`)) {
      router.push(folder.parentId ? `/folders/${folder.parentId}` : "/folders")
    } else {
      router.refresh()
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${folder.name}`}
          className={
            className ??
            "flex size-8 items-center justify-center border border-border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted"
          }
        >
          <MoreHorizontalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {depthOf(folders, folder.id) < MAX_FOLDER_DEPTH ? (
            <DropdownMenuItem onClick={() => setDialog("new")}>
              <FolderPlusIcon />
              New subfolder
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("move")}>
            <FolderInputIcon />
            Move to…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
            <Trash2Icon />
            Delete folder…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewFolderDialog
        open={dialog === "new"}
        onOpenChange={close}
        parentId={folder.id}
        parentName={folder.name}
      />
      {dialog === "rename" ? <RenameFolderDialog folder={folder} onOpenChange={close} /> : null}
      {dialog === "move" ? (
        <MoveFolderDialog folder={folder} folders={folders} onOpenChange={close} />
      ) : null}
      {dialog === "delete" ? (
        <DeleteFolderDialog
          folder={folder}
          folders={folders}
          onOpenChange={close}
          onDeleted={afterDelete}
        />
      ) : null}
    </>
  )
}
