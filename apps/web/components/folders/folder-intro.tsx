import { ChevronRightIcon, FolderIcon } from "lucide-react"
import Link from "next/link"
import { childrenOf, folderPath } from "@/lib/folders/tree"
import type { Folder } from "@/lib/folders/types"
import { formatNumber } from "@/lib/format"

// Above a folder's pastes: where it sits in the tree, and the folders directly inside it.
export function FolderIntro({ folder, folders }: { folder: Folder; folders: Folder[] }) {
  const trail = folderPath(folders, folder.id)
  const subfolders = childrenOf(folders, folder.id)

  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="Folder path"
        className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground"
      >
        <Link href="/folders" className="hover:text-foreground hover:underline">
          Folders
        </Link>
        {trail.map((step, index) => (
          <span key={step.id} className="flex items-center gap-1">
            <ChevronRightIcon className="size-3" />
            {index === trail.length - 1 ? (
              <span aria-current="page" className="font-medium text-foreground">
                {step.name}
              </span>
            ) : (
              <Link href={`/folders/${step.id}`} className="hover:text-foreground hover:underline">
                {step.name}
              </Link>
            )}
          </span>
        ))}
      </nav>
      {subfolders.length > 0 ? (
        <ul aria-label="Subfolders" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subfolders.map((child) => (
            <li key={child.id}>
              <Link
                href={`/folders/${child.id}`}
                className="flex h-10 items-center gap-2 border border-border px-3 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{child.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(child.pasteCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
