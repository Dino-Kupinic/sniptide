"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import { SLUG_PATTERN } from "@/lib/pastes/store"
import * as store from "./store"
import {
  DELETE_CONTENTS,
  type DeleteContents,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
  MAX_FOLDERS,
  MAX_MOVE_PASTES,
} from "./types"

async function assertSignedIn() {
  if (!(await getSession())) throw new Error(await actionError("signInFolders"))
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the folder a name.")
  .max(MAX_FOLDER_NAME_LENGTH, `Names are limited to ${MAX_FOLDER_NAME_LENGTH} characters.`)

// A folder id from the client. One that isn't an id at all can't name a folder.
const idSchema = z.uuid("That folder no longer exists.")
const parentSchema = idSchema.nullable()

export type FolderActionResult = { ok: true; id: string } | { ok: false; error: string }

const failures = {
  duplicate: "A folder with that name is already there.",
  limit: `You can have up to ${MAX_FOLDERS} folders.`,
  depth: `Folders can be nested ${MAX_FOLDER_DEPTH} levels deep.`,
  missing: "That folder no longer exists.",
  cycle: "A folder can't go inside itself.",
} as const

// Messages are written in English here and translated to the viewer's language on the way out.
async function fail(message: string) {
  return { ok: false as const, error: await translateActionError(message) }
}

async function done(result: store.FolderResult): Promise<FolderActionResult> {
  if (result.status !== "ok") return fail(failures[result.status])
  revalidatePath("/", "layout")
  return { ok: true, id: result.folder.id }
}

function invalid(error: z.ZodError) {
  return fail(error.issues[0]?.message ?? "Check the folder and try again.")
}

// `parentId` is the folder to create it in; null or left out makes a top-level folder.
export async function createFolder(name: string, parentId: string | null = null) {
  await assertSignedIn()
  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return invalid(parsedName.error)
  const parent = parentSchema.safeParse(parentId)
  if (!parent.success) return invalid(parent.error)
  return done(await store.createFolder(parsedName.data, parent.data))
}

export async function renameFolder(id: string, name: string) {
  await assertSignedIn()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return invalid(parsedName.error)
  return done(await store.renameFolder(parsedId.data, parsedName.data))
}

// Moves a folder, and everything in it, under another folder, or to the top level with null.
export async function moveFolder(id: string, parentId: string | null) {
  await assertSignedIn()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parent = parentSchema.safeParse(parentId)
  if (!parent.success) return invalid(parent.error)
  return done(await store.moveFolder(parsedId.data, parent.data))
}

export type DeleteFolderActionResult =
  | { ok: true; folders: number; pastes: number }
  | { ok: false; error: string }

// `contents` says what happens to what was inside: "move" lifts subfolders and pastes into the
// parent, "trash" sends the pastes to the trash. It is required, so no delete is ever the default
// one.
export async function deleteFolder(
  id: string,
  contents: DeleteContents,
): Promise<DeleteFolderActionResult> {
  await assertSignedIn()
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return invalid(parsedId.error)
  const parsedContents = z.enum(DELETE_CONTENTS).safeParse(contents)
  if (!parsedContents.success) {
    return fail("Choose what happens to the pastes inside.")
  }
  const result = await store.deleteFolder(parsedId.data, parsedContents.data)
  if (result.status === "missing") return fail(failures.missing)
  revalidatePath("/", "layout")
  return { ok: true, folders: result.folders, pastes: result.pastes }
}

const slugsSchema = z
  .array(z.string().regex(SLUG_PATTERN))
  .max(MAX_MOVE_PASTES, `Move up to ${MAX_MOVE_PASTES} pastes at once.`)

export type MovePastesActionResult = { ok: true; moved: number } | { ok: false; error: string }

// Files the viewer's pastes in a folder, or takes them out of any folder with null. Pastes that
// aren't theirs or are in the trash are left where they are; `moved` is how many changed.
export async function movePastes(
  slugs: string[],
  folderId: string | null,
): Promise<MovePastesActionResult> {
  await assertSignedIn()
  const parsedSlugs = slugsSchema.safeParse(slugs)
  if (!parsedSlugs.success) {
    return fail(parsedSlugs.error.issues[0]?.message ?? "Check the pastes.")
  }
  const folder = parentSchema.safeParse(folderId)
  if (!folder.success) return invalid(folder.error)
  const result = await store.movePastes([...new Set(parsedSlugs.data)], folder.data)
  if (result.status === "missing") return fail(failures.missing)
  revalidatePath("/", "layout")
  return { ok: true, moved: result.moved }
}
