import "server-only"

import { z } from "zod"
import { collectionsOf, createCollectionFor } from "@/lib/collections/store"
import { type Collection, MAX_COLLECTIONS, MAX_NAME_LENGTH } from "@/lib/collections/types"
import { announceChange } from "@/lib/live/changes"
import { ApiError } from "./http"
import { type CreateReceipt, createWithReceipt } from "./idempotency"

// Collections over the token API, so the CLI and agents can see where pastes can be filed and
// make a new place for them. Renaming and deleting stay in the app.

export interface ApiCollection {
  slug: string
  name: string
  pasteCount: number
}

function toApiCollection(collection: Collection): ApiCollection {
  return { slug: collection.slug, name: collection.name, pasteCount: collection.pasteCount }
}

export async function listApiCollections(owner: string) {
  return { collections: (await collectionsOf(owner)).map(toApiCollection) }
}

export const collectionInputSchema = z
  .object({ name: z.string().trim().min(1).max(MAX_NAME_LENGTH) })
  .strict()

export async function createApiCollection(owner: string, input: unknown, receipt?: CreateReceipt) {
  const response = await createWithReceipt(receipt, async (tx) => {
    const { name } = collectionInputSchema.parse(input)
    const result = await createCollectionFor(owner, name, undefined, tx)
    if (result.status === "duplicate")
      throw new ApiError(409, "You already have a collection with that name.")
    if (result.status !== "ok")
      throw new ApiError(422, `You can have up to ${MAX_COLLECTIONS} collections.`)
    return { collection: toApiCollection(result.collection) }
  })
  await announceChange(owner)
  return response
}
