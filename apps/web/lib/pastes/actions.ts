"use server"

import { z } from "zod"
import { getSession } from "@/lib/auth"
import { collectionExists } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { formatLimit } from "@/lib/format"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import { revalidateWorkspace } from "@/lib/live/changes"
import { changePreferences, readPreferences } from "@/lib/preference-store"
import { getSiteOrigin } from "@/lib/site"
import {
  fetchGist,
  type GistOwner,
  gistDescription,
  gistTitle,
  parseGistId,
  readGistFiles,
} from "./gist"
import { detectLanguage } from "./languages"
import { limited, limits } from "./limits"
import { pasteSchema } from "./schema"
import { hasSensitiveContent, suggestedVisibility } from "./smart-defaults"
import * as store from "./store"
import {
  ACCESSES,
  type Access,
  EXPIRIES,
  type Expiry,
  type ShareInvite,
  type SharePerson,
  VISIBILITIES,
  type Visibility,
} from "./types"

async function rememberDefaultsBestEffort(
  userId: string,
  visibility: Visibility,
  expiry: Expiry | "keep",
) {
  if (expiry === "keep") return
  await changePreferences(userId, (current) => ({
    ...current,
    defaultVisibility: visibility,
    defaultExpiry: expiry,
  })).catch(() => false)
}

async function assertSignedIn() {
  const session = await getSession()
  if (!session) throw new Error(await actionError("signInPastes"))
  return session.user.id
}

export type ActionOutcome = { ok: true } | { ok: false; error: string }

export type SavePasteInput = z.input<typeof pasteSchema>
export type SavePasteResult = { ok: true; slug: string } | { ok: false; error: string }

const invitesSchema = z
  .array(z.object({ userId: z.string().min(1).max(100), access: z.enum(ACCESSES) }))
  .max(50, "Invite up to 50 people at once.")

// The checks creating and editing share, run once the input's own shape is known to be valid.
async function checkedPayload(data: z.output<typeof pasteSchema>, editing?: string) {
  if (data.slug && !(await store.isSlugAvailable(data.slug, editing))) {
    return {
      ok: false as const,
      error: await actionError("slugTaken", {
        link: `${(await getSiteOrigin()).host}/${data.slug}`,
      }),
    }
  }
  if (data.collection !== null && !(await collectionExists(data.collection))) {
    return { ok: false as const, error: await actionError("collectionMissing") }
  }
  // On edit an empty password means "keep the current one"; a new paste needs a real one.
  const current = editing ? await store.getPaste(editing) : null
  if (data.password === "" && !current?.password) {
    return {
      ok: false as const,
      error: await actionError("passwordRequired"),
    }
  }

  return {
    ok: true as const,
    payload: {
      ...data,
      files: data.files.map((file) => ({
        ...file,
        language: detectLanguage(file.name).id,
      })),
    },
  }
}

// Creates a paste, or updates `editing` when given. Returns the slug to navigate to. A new paste
// is also shared with `invites`, people looked up with `findPerson`.
export async function savePaste(
  input: SavePasteInput,
  editing?: string,
  invites: ShareInvite[] = [],
): Promise<SavePasteResult> {
  const user = await assertSignedIn()

  const parsed = pasteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: await translateActionError(
        parsed.error.issues[0]?.message ?? "Check the paste and try again.",
      ),
    }
  }
  const tooOften = await limited(editing ? limits.edit(user) : limits.create(user))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }

  const checked = await checkedPayload(parsed.data, editing)
  if (!checked.ok) return checked

  try {
    const paste = editing
      ? await store.updatePaste(editing, checked.payload, "Edited")
      : await store.createPaste(checked.payload, invitesSchema.parse(invites))
    if (!paste) return { ok: false, error: await actionError("pasteMissing") }
    if ("conflict" in paste) return { ok: false, error: await actionError("pasteConflict") }

    if (!editing) await rememberDefaultsBestEffort(user, parsed.data.visibility, parsed.data.expiry)
    await revalidateWorkspace(user)
    return { ok: true, slug: paste.slug }
  } catch (error) {
    if (error instanceof store.PasteBudgetError)
      return { ok: false, error: await translateActionError(error.message) }
    throw error
  }
}

export type AutosavePasteResult =
  | {
      ok: true
      slug: string
      // Send it back with the next auto-save.
      version: number
      expiresAt: number | null
      hasPassword: boolean
    }
  | { ok: false; error: string }
  // Someone saved a newer version first; `version` and `slug` are what the server has now.
  | { ok: false; conflict: true; version: number; slug: string }

// Saves an edit to a paste the editor has open. `expectedVersion` is the version the editor last
// saw: if the paste has moved on (another tab, device or collaborator saved), nothing is written
// and the editor is told, so the two edits can be settled by the person. Edits close together
// share a revision.
export async function autosavePaste(
  editing: string,
  input: SavePasteInput,
  expectedVersion: number,
): Promise<AutosavePasteResult> {
  const user = await assertSignedIn()

  const parsed = pasteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: await translateActionError(
        parsed.error.issues[0]?.message ?? "Check the paste and try again.",
      ),
    }
  }
  const tooOften = await limited(limits.autosave(user))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }

  const checked = await checkedPayload(parsed.data, editing)
  if (!checked.ok) return checked

  try {
    const result = await store.updatePaste(editing, checked.payload, "Edited", {
      expectedVersion,
      batchRevision: true,
    })
    if (!result) return { ok: false, error: await actionError("pasteMissing") }
    if ("conflict" in result) {
      return { ok: false, conflict: true, version: result.version, slug: result.slug }
    }

    // If the custom link changed, the page the editor is on no longer exists. Refreshing it now
    // would 404 under the editor, so the editor moves to the new link first and refreshes there.
    if (result.slug === editing) await revalidateWorkspace(user)
    return { ok: true, ...result }
  } catch (error) {
    if (error instanceof store.PasteBudgetError)
      return { ok: false, error: await translateActionError(error.message) }
    throw error
  }
}

// Called when the editor is closed with Done: the edits so far stay one revision, and the next
// time the paste is edited it starts a new one.
export async function finishEditing(editing: string): Promise<void> {
  const user = await assertSignedIn()
  if (await limited(limits.autosave(user))) return
  await store.sealRevision(editing, "Edited")
}

// Rolls a paste back to an earlier revision (see store.restoreRevision).
export async function restoreRevision(slug: string, revisionId: number) {
  const user = await assertSignedIn()
  if (!Number.isSafeInteger(revisionId))
    return { ok: false as const, error: await actionError("pickVersion") }
  const tooOften = await limited(limits.edit(user))
  if (tooOften) return { ok: false as const, error: await translateActionError(tooOften) }

  const result = await store.restoreRevision(slug, revisionId)
  if (result.ok) await revalidateWorkspace(user)
  return result.ok ? result : { ...result, error: await translateActionError(result.error) }
}

// Answers "not available" while limited; saving checks the slug again anyway.
export async function checkSlug(slug: string, except?: string) {
  const user = await assertSignedIn()
  if (await limited(limits.slugCheck(user))) return false
  return store.isSlugAvailable(slug, except)
}

const sharingSchema = z.object({
  visibility: z.enum(VISIBILITIES).optional(),
  expiry: z.enum(EXPIRIES).optional(),
  password: z.string().min(1).max(200).nullable().optional(),
  burnAfterRead: z.boolean().optional(),
  allowRaw: z.boolean().optional(),
})

export async function updateSharing(slug: string, input: z.input<typeof sharingSchema>) {
  const user = await assertSignedIn()
  await store.updateSharing(slug, sharingSchema.parse(input))
  await revalidateWorkspace(user)
}

export type FindPersonResult =
  | { ok: true; person: Omit<SharePerson, "access" | "sharedAt"> }
  | { ok: false; error: string }

// Looks up who to invite by their exact email or username.
export async function findPerson(identifier: string): Promise<FindPersonResult> {
  const user = await assertSignedIn()
  const text = z.string().trim().min(1).max(320).safeParse(identifier)
  if (!text.success) return { ok: false, error: await actionError("personIdentifier") }
  const tooOften = await limited(limits.personLookup(user))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }

  const found = await store.findPerson(text.data)
  if (found.status === "self") return { ok: false, error: await actionError("personSelf") }
  if (found.status === "missing") {
    return { ok: false, error: await actionError("personMissing") }
  }
  return { ok: true, person: found.person }
}

export type ShareResult = { ok: true; people: SharePerson[] } | { ok: false; error: string }

async function sharesOf(slug: string): Promise<ShareResult> {
  const people = await store.listPasteShares(slug)
  return people ? { ok: true, people } : { ok: false, error: await actionError("pasteMissing") }
}

// Who one of the viewer's pastes is shared with, for the share dialog.
export async function listPasteShares(slug: string): Promise<ShareResult> {
  await assertSignedIn()
  return sharesOf(slug)
}

// Invites someone (by exact email or username) to one of the viewer's pastes, or changes the
// access they already have.
export async function invitePerson(
  slug: string,
  identifier: string,
  access: Access,
): Promise<ShareResult> {
  const found = await findPerson(identifier)
  if (!found.ok) return found
  return setShareAccess(slug, found.person.id, access)
}

export async function setShareAccess(
  slug: string,
  userId: string,
  access: Access,
): Promise<ShareResult> {
  const user = await assertSignedIn()
  const parsed = z.enum(ACCESSES).safeParse(access)
  if (!parsed.success) return { ok: false, error: await actionError("pickAccess") }
  if (!(await store.sharePaste(slug, userId, parsed.data))) {
    return { ok: false, error: await actionError("shareMissing") }
  }
  await revalidateWorkspace(user, userId)
  return sharesOf(slug)
}

export async function removeShare(slug: string, userId: string): Promise<ShareResult> {
  const user = await assertSignedIn()
  await store.unsharePaste(slug, userId)
  await revalidateWorkspace(user, userId)
  return sharesOf(slug)
}

// Undoes removeShare: the same access, in the same place in the list. The person sees the paste
// as new again, since opening it before is forgotten.
export async function restoreRemovedShare(
  slug: string,
  userId: string,
  access: Access,
  sharedAt: number,
): Promise<ShareResult> {
  const user = await assertSignedIn()
  const parsed = z
    .object({ access: z.enum(ACCESSES), sharedAt: z.number().int().positive() })
    .safeParse({ access, sharedAt })
  if (!parsed.success) return { ok: false, error: await actionError("shareRestore") }
  const date = new Date(Math.min(parsed.data.sharedAt, Date.now()))
  if (!(await store.sharePaste(slug, userId, parsed.data.access, date))) {
    return { ok: false, error: await actionError("shareMissing") }
  }
  await revalidateWorkspace(user, userId)
  return sharesOf(slug)
}

// Drops a paste someone shared with the viewer from their Shared with me.
export async function leaveShare(slug: string) {
  const user = await assertSignedIn()
  await store.leaveShare(slug)
  await revalidateWorkspace(user)
}

// Undoes leaveShare, unless the owner has revoked the share since.
export async function restoreShare(slug: string): Promise<ActionOutcome> {
  const user = await assertSignedIn()
  if (!(await store.restoreShare(slug))) {
    return { ok: false, error: await actionError("shareRevoked") }
  }
  await revalidateWorkspace(user)
  return { ok: true }
}

export async function setStarred(slug: string, starred: boolean) {
  const user = await assertSignedIn()
  await store.setStarred(slug, starred)
  await revalidateWorkspace(user)
}

export async function renamePaste(slug: string, title: string) {
  const user = await assertSignedIn()
  const parsed = pasteSchema.shape.title.safeParse(title)
  if (!parsed.success) {
    return {
      ok: false as const,
      error: await translateActionError(parsed.error.issues[0]?.message ?? "Check the title."),
    }
  }
  await store.renamePaste(slug, parsed.data)
  await revalidateWorkspace(user)
  return { ok: true as const }
}

export async function setPasteCollection(slug: string, collection: string | null) {
  const user = await assertSignedIn()
  if (collection !== null && !(await collectionExists(collection))) {
    return { ok: false as const, error: await actionError("collectionMissing") }
  }
  await store.setPasteCollection(slug, collection)
  await revalidateWorkspace(user)
  return { ok: true as const }
}

export async function trashPaste(slug: string) {
  const user = await assertSignedIn()
  await store.trashPaste(slug)
  await revalidateWorkspace(user)
}

export async function restorePaste(slug: string): Promise<ActionOutcome> {
  const user = await assertSignedIn()
  const restored = await store.restorePaste(slug)
  await revalidateWorkspace(user)
  return restored ? { ok: true } : { ok: false, error: await actionError("pasteGone") }
}

export async function deleteForever(slug: string) {
  const user = await assertSignedIn()
  await store.deleteForever(slug)
  await revalidateWorkspace(user)
}

export async function emptyTrash() {
  const user = await assertSignedIn()
  await store.emptyTrash()
  await revalidateWorkspace(user)
}

export type GistPreview = {
  id: string
  owner: GistOwner | null
  title: string
  // The paste size limit, in bytes and as the label the UI shows ("1 MB").
  limitBytes: number
  limitLabel: string
  defaults: { visibility: Visibility; expiry: Expiry }
  files: { name: string; size: number; skipped: string | null; sensitive: boolean }[]
}
export type GistPreviewResult = { ok: true; gist: GistPreview } | { ok: false; error: string }

// Reads a public GitHub gist (a gist URL or its id) and describes its files. Saves nothing.
export async function previewGist(input: string): Promise<GistPreviewResult> {
  const user = await assertSignedIn()

  const id = parseGistId(input)
  if (!id) return { ok: false, error: await actionError("gistLink") }

  const tooOften = await limited(limits.gist(user))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }

  const result = await fetchGist(id)
  if (!result.ok) return { ok: false, error: await translateActionError(result.error) }

  const { maxPasteBytes } = getConfig()
  const { gist } = result
  const preferences = await readPreferences(user)
  return {
    ok: true,
    gist: {
      id: gist.id,
      owner: gist.owner,
      title: gist.description ?? gist.files[0]?.name ?? "Imported gist",
      limitBytes: maxPasteBytes,
      limitLabel: formatLimit(maxPasteBytes),
      defaults: { visibility: preferences.defaultVisibility, expiry: preferences.defaultExpiry },
      files: await Promise.all(
        gist.files.map(async ({ name, size, skipped, content }) => ({
          name,
          size,
          skipped: skipped ? await translateActionError(skipped) : null,
          sensitive: content === null || hasSensitiveContent([{ name, content }]),
        })),
      ),
    },
  }
}

const importSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{20,40}$/i),
  visibility: z.enum(VISIBILITIES).optional(),
  expiry: z.enum(EXPIRIES).optional(),
  files: z
    .array(z.string())
    .min(1, "Pick at least one file.")
    .max(10, "A paste can hold up to 10 files."),
})

// Copies the chosen files of a public GitHub gist into a new paste. The gist is read again, so
// what's saved is what GitHub has now, and it goes through the same checks as a paste saved in
// the editor.
export async function importGist(input: z.input<typeof importSchema>): Promise<SavePasteResult> {
  const user = await assertSignedIn()

  const choice = importSchema.safeParse(input)
  if (!choice.success) {
    return {
      ok: false,
      error: await translateActionError(
        choice.error.issues[0]?.message ?? "Check the import and try again.",
      ),
    }
  }
  const { id, files: names } = choice.data

  const tooOften = await limited(limits.create(user))
  if (tooOften) return { ok: false, error: await translateActionError(tooOften) }

  const result = await fetchGist(id)
  if (!result.ok) return { ok: false, error: await translateActionError(result.error) }
  const { gist } = result

  const read = await readGistFiles(gist, names)
  if (!read.ok) return { ok: false, error: await translateActionError(read.error) }
  const preferences = await readPreferences(user)
  const visibility = gist.files.some((file) => names.includes(file.name) && file.content === null)
    ? "private"
    : suggestedVisibility(read.files, choice.data.visibility ?? preferences.defaultVisibility)

  const parsed = pasteSchema.safeParse({
    title: gistTitle(gist, read.files[0]?.name),
    description: gistDescription(gist),
    files: read.files,
    visibility,
    expiry: choice.data.expiry ?? preferences.defaultExpiry,
    slug: "",
    collection: null,
    password: null,
    burnAfterRead: false,
  } satisfies SavePasteInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: await translateActionError(
        parsed.error.issues[0]?.message ?? "That gist couldn't be imported.",
      ),
    }
  }

  try {
    const paste = await store.createPaste({
      ...parsed.data,
      files: parsed.data.files.map((file) => ({
        ...file,
        language: detectLanguage(file.name).id,
      })),
    })

    await rememberDefaultsBestEffort(user, parsed.data.visibility, parsed.data.expiry)
    await revalidateWorkspace(user)
    return { ok: true, slug: paste.slug }
  } catch (error) {
    if (error instanceof store.PasteBudgetError)
      return { ok: false, error: await translateActionError(error.message) }
    throw error
  }
}
