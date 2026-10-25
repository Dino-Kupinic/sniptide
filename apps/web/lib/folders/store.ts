import "server-only"

import { allowedPaste } from "@workspace/db/moderation"
import { folder as folderTable, paste as pasteTable, user } from "@workspace/db/schema"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { cache } from "react"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { checkMove, depthOf, descendantIds, sameName, uniqueName } from "./tree"
import {
  type DeleteContents,
  type Folder,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
  MAX_FOLDERS,
} from "./types"

// Folders arrange a user's own pastes in a tree: a paste is in at most one folder
// (paste.folder_id), and a folder has at most one parent. Each belongs to one account and is only
// ever read or changed through the signed-in viewer. Callers pass a folder's id, never a name,
// since names repeat across branches and change on rename.

async function viewerId() {
  return (await getSession())?.user.id ?? null
}

async function requireViewerId() {
  const id = await viewerId()
  if (!id) throw new Error("Sign in to change folders.")
  return id
}

type Db = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]

// The owner's folders as the tree helpers read them. Used inside a transaction after the owner's
// row is locked, so what the checks see can't change before the write.
async function ownersFolders(tx: Db, owner: string): Promise<Folder[]> {
  const rows = await tx
    .select({ id: folderTable.id, parentId: folderTable.parentId, name: folderTable.name })
    .from(folderTable)
    .where(eq(folderTable.ownerId, owner))
  return rows.map((row) => ({ ...row, pasteCount: 0 }))
}

// Every create, rename, move and delete takes the same lock on the owner's row, so concurrent
// requests across app instances check against each other's committed changes.
async function lockOwner(tx: Db, owner: string) {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, owner)).for("update")
}

// The viewer's folders, oldest first, with how many live pastes each holds directly.
export const listFolders = cache(async (): Promise<Folder[]> => {
  const viewer = await viewerId()
  if (!viewer) return []
  return getDb()
    .select({
      id: folderTable.id,
      parentId: folderTable.parentId,
      name: folderTable.name,
      pasteCount: sql<number>`count(${pasteTable.id})::int`,
    })
    .from(folderTable)
    .leftJoin(
      pasteTable,
      and(
        allowedPaste(),
        eq(pasteTable.ownerId, folderTable.ownerId),
        eq(pasteTable.folderId, folderTable.id),
        isNull(pasteTable.deletedAt),
      ),
    )
    .where(eq(folderTable.ownerId, viewer))
    .groupBy(folderTable.id)
    .orderBy(folderTable.createdAt, folderTable.id)
})

export async function getFolder(id: string) {
  return (await listFolders()).find((candidate) => candidate.id === id) ?? null
}

// Whether the viewer has a folder with this id, for checking where a paste is being filed.
export async function folderExists(id: string) {
  const viewer = await viewerId()
  if (!viewer) return false
  const [row] = await getDb()
    .select({ id: folderTable.id })
    .from(folderTable)
    .where(and(eq(folderTable.ownerId, viewer), eq(folderTable.id, id)))
  return Boolean(row)
}

export type FolderResult =
  | { status: "ok"; folder: Folder }
  | { status: "duplicate" }
  | { status: "limit" }
  | { status: "depth" }
  // The folder, or the folder it was to go in, is gone.
  | { status: "missing" }
  // A folder can't go inside itself or one of its own subfolders.
  | { status: "cycle" }

function nameTaken(folders: readonly Folder[], parentId: string | null, name: string, except = "") {
  return folders.some(
    (other) => other.id !== except && other.parentId === parentId && sameName(other.name, name),
  )
}

export async function createFolder(name: string, parentId: string | null): Promise<FolderResult> {
  const owner = await requireViewerId()
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, owner)
    const all = await ownersFolders(tx, owner)
    if (parentId !== null && !all.some((other) => other.id === parentId)) {
      return { status: "missing" }
    }
    if (all.length >= MAX_FOLDERS) return { status: "limit" }
    if (depthOf(all, parentId) + 1 > MAX_FOLDER_DEPTH) return { status: "depth" }
    if (nameTaken(all, parentId, name)) return { status: "duplicate" }

    const [row] = await tx
      .insert(folderTable)
      .values({ ownerId: owner, parentId, name })
      .returning()
    if (!row) return { status: "missing" }
    return { status: "ok", folder: { id: row.id, parentId, name: row.name, pasteCount: 0 } }
  })
}

export async function renameFolder(id: string, name: string): Promise<FolderResult> {
  const owner = await requireViewerId()
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, owner)
    const all = await ownersFolders(tx, owner)
    const current = all.find((other) => other.id === id)
    if (!current) return { status: "missing" }
    if (nameTaken(all, current.parentId, name, id)) return { status: "duplicate" }
    await tx
      .update(folderTable)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(folderTable.ownerId, owner), eq(folderTable.id, id)))
    return { status: "ok", folder: { ...current, name } }
  })
}

// Moves a folder, with everything in it, under `parentId` (null for the top level).
export async function moveFolder(id: string, parentId: string | null): Promise<FolderResult> {
  const owner = await requireViewerId()
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, owner)
    const all = await ownersFolders(tx, owner)
    const current = all.find((other) => other.id === id)
    if (!current) return { status: "missing" }
    if (parentId !== null && !all.some((other) => other.id === parentId)) {
      return { status: "missing" }
    }
    const check = checkMove(all, id, parentId)
    if (check === "same") return { status: "ok", folder: current }
    if (check !== "ok") return { status: check }
    await tx
      .update(folderTable)
      .set({ parentId, updatedAt: new Date() })
      .where(and(eq(folderTable.ownerId, owner), eq(folderTable.id, id)))
    return { status: "ok", folder: { ...current, parentId } }
  })
}

export type DeleteFolderResult =
  | {
      status: "ok"
      // Folders removed, the folder itself and any below it.
      folders: number
      // Live pastes that were inside: moved up with "move", sent to the trash with "trash".
      pastes: number
    }
  | { status: "missing" }

// Deletes a folder and decides, as `contents` says, what happens to what was inside. No paste is
// deleted: they move up a level or go to the trash (still restorable). Trashed pastes in the
// folder are moved along with the rest in either case, so none keeps pointing at a folder that is
// gone, which the paste.folder_id foreign key would refuse anyway.
export async function deleteFolder(
  id: string,
  contents: DeleteContents,
): Promise<DeleteFolderResult> {
  const owner = await requireViewerId()
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, owner)
    const all = await ownersFolders(tx, owner)
    const current = all.find((other) => other.id === id)
    if (!current) return { status: "missing" }

    const owned = and(allowedPaste(), eq(pasteTable.ownerId, owner), isNull(pasteTable.deletedAt))
    if (contents === "move") {
      const parentId = current.parentId
      // Subfolders keep their names where they can. One that would clash with a folder already in
      // the parent is renamed rather than refused, so deleting is never blocked on it.
      const taken = all
        .filter((other) => other.parentId === parentId && other.id !== id)
        .map((other) => other.name)
      for (const child of all.filter((other) => other.parentId === id)) {
        const name = uniqueName(child.name, taken, MAX_FOLDER_NAME_LENGTH)
        taken.push(name)
        await tx
          .update(folderTable)
          .set({ parentId, name, updatedAt: new Date() })
          .where(eq(folderTable.id, child.id))
      }
      const moved = await tx
        .update(pasteTable)
        .set({ folderId: parentId })
        .where(and(eq(pasteTable.ownerId, owner), eq(pasteTable.folderId, id)))
        .returning({ deletedAt: pasteTable.deletedAt })
      await tx.delete(folderTable).where(eq(folderTable.id, id))
      return { status: "ok", folders: 1, pastes: moved.filter((row) => !row.deletedAt).length }
    }

    const subtree = [id, ...descendantIds(all, id)]
    const trashed = await tx
      .update(pasteTable)
      .set({ deletedAt: new Date() })
      .where(and(owned, inArray(pasteTable.folderId, subtree)))
      .returning({ id: pasteTable.id })
    // Already-trashed pastes in the subtree lose their folder too.
    await tx
      .update(pasteTable)
      .set({ folderId: null })
      .where(and(eq(pasteTable.ownerId, owner), inArray(pasteTable.folderId, subtree)))
    // One statement, so the parent links among the folders being removed are checked together.
    await tx.delete(folderTable).where(inArray(folderTable.id, subtree))
    return { status: "ok", folders: subtree.length, pastes: trashed.length }
  })
}

export type MovePastesResult =
  | { status: "ok"; moved: number }
  // The destination folder is gone.
  | { status: "missing" }

// Files the viewer's pastes in a folder, or takes them out of any folder with null. Slugs that
// aren't the viewer's own, or are in the trash, are skipped; `moved` counts the rest. A paste keeps
// its place in the "recent" order, as with renaming.
export async function movePastes(
  slugs: string[],
  folderId: string | null,
): Promise<MovePastesResult> {
  const owner = await requireViewerId()
  return getDb().transaction(async (tx) => {
    await lockOwner(tx, owner)
    if (folderId !== null) {
      const [target] = await tx
        .select({ id: folderTable.id })
        .from(folderTable)
        .where(and(eq(folderTable.ownerId, owner), eq(folderTable.id, folderId)))
      if (!target) return { status: "missing" }
    }
    if (slugs.length === 0) return { status: "ok", moved: 0 }
    const moved = await tx
      .update(pasteTable)
      .set({ folderId })
      .where(
        and(
          allowedPaste(),
          eq(pasteTable.ownerId, owner),
          isNull(pasteTable.deletedAt),
          inArray(pasteTable.slug, slugs),
        ),
      )
      .returning({ id: pasteTable.id })
    return { status: "ok", moved: moved.length }
  })
}
