import type { Folder } from "./types"

// Pure helpers over a flat folder list (parentId links), shared by the store and the screens. The
// list is one owner's folders, so it stays small (MAX_FOLDERS) and is walked in memory.

export interface FolderNode extends Folder {
  children: FolderNode[]
}

const byName = (a: Pick<Folder, "name">, b: Pick<Folder, "name">) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })

// Folder names are unique among siblings regardless of case, as the folder table's indexes say.
export function sameName(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

export function childrenOf(folders: readonly Folder[], parentId: string | null) {
  return folders.filter((folder) => folder.parentId === parentId).sort(byName)
}

// Every folder below `id`, at any depth, not including `id` itself.
export function descendantIds(folders: readonly Folder[], id: string) {
  const found: string[] = []
  const queue = [id]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const folder of folders) {
      if (folder.parentId === next) {
        found.push(folder.id)
        queue.push(folder.id)
      }
    }
  }
  return found
}

// The folders from the top level down to `id`, `id` last; empty when it doesn't exist.
export function folderPath(folders: readonly Folder[], id: string | null): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: Folder[] = []
  const seen = new Set<string>()
  for (let at = id; at !== null; ) {
    const folder = byId.get(at)
    if (!folder || seen.has(at)) return []
    seen.add(at)
    path.unshift(folder)
    at = folder.parentId
  }
  return path
}

// How deep `id` sits: a top-level folder is 1 and the top level itself (null) is 0.
export function depthOf(folders: readonly Folder[], id: string | null) {
  return folderPath(folders, id).length
}

// The levels in the subtree rooted at `id`, `id` included: a folder with no subfolders is 1.
export function heightOf(folders: readonly Folder[], id: string): number {
  let height = 1
  let level = [id]
  while (level.length > 0) {
    const next = folders.filter((folder) => folder.parentId && level.includes(folder.parentId))
    if (next.length > 0) height++
    level = next.map((folder) => folder.id)
  }
  return height
}

export function buildTree(folders: readonly Folder[]): FolderNode[] {
  const build = (parentId: string | null): FolderNode[] =>
    childrenOf(folders, parentId).map((folder) => ({ ...folder, children: build(folder.id) }))
  return build(null)
}

// A name for `wanted` that no sibling in `taken` uses: "Notes" becomes "Notes (2)", "Notes (3)".
export function uniqueName(wanted: string, taken: readonly string[], maxLength: number) {
  const clash = (name: string) => taken.some((other) => sameName(other, name))
  if (!clash(wanted)) return wanted
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const name = `${wanted.slice(0, maxLength - suffix.length).trimEnd()}${suffix}`
    if (!clash(name)) return name
  }
}
