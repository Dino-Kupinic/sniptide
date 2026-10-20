"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import * as store from "./store"
import { HUES, ICONS, MAX_COLLECTIONS, MAX_NAME_LENGTH } from "./types"

async function assertSignedIn() {
  if (!(await getSession())) throw new Error(await actionError("signInCollections"))
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the collection a name.")
  .max(MAX_NAME_LENGTH, `Names are limited to ${MAX_NAME_LENGTH} characters.`)

export type CollectionActionResult = { ok: true; slug: string } | { ok: false; error: string }

const failures = {
  duplicate: "You already have a collection with that name.",
  limit: `You can have up to ${MAX_COLLECTIONS} collections.`,
  missing: "That collection no longer exists.",
} as const

async function save(
  name: string,
  write: (name: string) => Promise<store.CollectionResult>,
): Promise<CollectionActionResult> {
  await assertSignedIn()
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) {
    return {
      ok: false,
      error: await translateActionError(parsed.error.issues[0]?.message ?? "Check the name."),
    }
  }

  const result = await write(parsed.data)
  if (result.status !== "ok")
    return { ok: false, error: await translateActionError(failures[result.status]) }

  revalidatePath("/", "layout")
  return { ok: true, slug: result.collection.slug }
}

const lookSchema = z.object({ icon: z.enum(ICONS), hue: z.enum(HUES) })

// `look` is the icon and hue picked in the New collection dialog; without it the store picks.
export async function createCollection(name: string, look?: { icon: string; hue: string }) {
  const parsed = look ? lookSchema.parse(look) : undefined
  return save(name, (next) => store.createCollection(next, parsed))
}

export async function renameCollection(
  slug: string,
  name: string,
  look?: { icon: string; hue: string },
) {
  const parsed = look ? lookSchema.parse(look) : undefined
  return save(name, (next) => store.renameCollection(slug, next, parsed))
}

export async function setCollectionIcon(slug: string, icon: string, hue: string) {
  await assertSignedIn()
  const parsed = lookSchema.parse({ icon, hue })
  await store.setCollectionIcon(slug, parsed.icon, parsed.hue)
  revalidatePath("/", "layout")
}

// Returns what was removed, for `restoreCollection` to take back; null when it was already gone.
export async function deleteCollection(slug: string): Promise<store.CollectionSnapshot | null> {
  await assertSignedIn()
  const snapshot = await store.deleteCollection(slug)
  revalidatePath("/", "layout")
  return snapshot
}

const snapshotSchema = z.object({
  slug: z.string().min(1).max(60),
  name: nameSchema,
  icon: z.enum(ICONS),
  hue: z.enum(HUES),
  createdAt: z.number().int().positive(),
  pastes: z.array(z.string().min(1).max(40)).max(10_000),
})

const restoreFailures = {
  duplicate: "You already have a collection with that name.",
  limit: `You can have up to ${MAX_COLLECTIONS} collections.`,
  taken: "A collection with that link exists now.",
} as const

// Undoes `deleteCollection`: brings the collection back with its pastes.
export async function restoreCollection(
  snapshot: store.CollectionSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertSignedIn()
  const parsed = snapshotSchema.safeParse(snapshot)
  if (!parsed.success) return { ok: false, error: await actionError("collectionRestore") }
  // The date only places it in the list; it can't be from the future.
  const createdAt = Math.min(parsed.data.createdAt, Date.now())
  const result = await store.restoreCollection({ ...parsed.data, createdAt })
  if (result.status !== "ok")
    return { ok: false, error: await translateActionError(restoreFailures[result.status]) }
  revalidatePath("/", "layout")
  return { ok: true }
}
