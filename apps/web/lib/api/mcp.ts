import "server-only"
import { type SniptideBackend, ToolError } from "@sniptide/mcp"
import { ZodError } from "zod"
import { createApiCollection, listApiCollections } from "./collections"
import { ApiError } from "./http"
import {
  collectionCaptures,
  createCapture,
  getCapture,
  listCaptures,
  listQuerySchema,
  recordTokenReads,
  setCollectionSteps,
  trashCapture,
  updateCapture,
  updateSettings,
} from "./pastes"
import type { TokenOwner } from "./tokens"

// Tools use the same service as /api/v1 without forwarding a token over a loopback request.
export function mcpBackend(owner: TokenOwner): SniptideBackend {
  async function safe<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof ApiError) throw new ToolError(error.message)
      if (error instanceof ZodError)
        throw new ToolError("Check the snippet fields, size limit and cursor.")
      throw error
    }
  }
  function write() {
    if (!owner.scopes.includes("write"))
      throw new ToolError("This token doesn't have the write scope.")
  }
  return {
    search: (input) =>
      safe(() => listCaptures(owner.userId, listQuerySchema.parse({ ...input, q: input.query }))),
    read: (id) =>
      safe(async () => {
        const paste = await getCapture(owner.userId, id)
        if (!paste) throw new ApiError(404, "No paste with that id.")
        await recordTokenReads(owner.userId, [paste.id])
        return { paste }
      }),
    collection: (slug, cursor) =>
      safe(async () => {
        const page = await collectionCaptures(owner.userId, slug, cursor)
        if (!page) throw new ApiError(404, "No collection with that name.")
        await recordTokenReads(
          owner.userId,
          page.pastes.map((paste) => paste.id),
        )
        return {
          pastes: page.pastes.map((paste) => ({ ...paste })),
          instructions: page.steps.map((step) => step.instruction),
          nextCursor: page.nextCursor,
        }
      }),
    setSteps: (slug, steps) =>
      safe(async () => {
        write()
        return setCollectionSteps(owner.userId, slug, { steps })
      }),
    create: (input) =>
      safe(async () => {
        write()
        return { paste: await createCapture(owner.userId, input) }
      }),
    update: (id, input) =>
      safe(async () => {
        write()
        return { paste: await updateCapture(owner.userId, id, input) }
      }),
    collections: () => safe(() => listApiCollections(owner.userId)),
    createCollection: (name) =>
      safe(async () => {
        write()
        return createApiCollection(owner.userId, { name })
      }),
    updateSettings: (id, input) =>
      safe(async () => {
        write()
        return updateSettings(owner.userId, id, input)
      }),
    trash: (id) =>
      safe(async () => {
        write()
        return trashCapture(owner.userId, id)
      }),
  }
}
