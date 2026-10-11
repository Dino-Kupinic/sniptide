"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { collectionExists } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { formatLimit } from "@/lib/format"
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
import * as store from "./store"
import { EXPIRIES, VISIBILITIES } from "./types"

async function assertSignedIn() {
  const session = await getSession()
  if (!session) throw new Error("Sign in to change pastes.")
  return session.user.id
}

export type SavePasteInput = z.input<typeof pasteSchema>
export type SavePasteResult = { ok: true; slug: string } | { ok: false; error: string }

// Creates a paste, or updates `editing` when given. Returns the slug to navigate to.
export async function savePaste(input: SavePasteInput, editing?: string): Promise<SavePasteResult> {
  const user = await assertSignedIn()

  const parsed = pasteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the paste and try again." }
  }
  const tooOften = await limited(editing ? limits.edit(user) : limits.create(user))
  if (tooOften) return { ok: false, error: tooOften }

  const data = parsed.data
  if (data.slug && !(await store.isSlugAvailable(data.slug, editing))) {
    return {
      ok: false,
      error: `${(await getSiteOrigin()).host}/${data.slug} is taken or not allowed.`,
    }
  }
  if (data.collection !== null && !(await collectionExists(data.collection))) {
    return { ok: false, error: "That collection no longer exists." }
  }
  // On edit an empty password means "keep the current one"; a new paste needs a real one.
  const current = editing ? await store.getOwnPaste(editing) : null
  if (data.password === "" && !current?.password) {
    return { ok: false, error: "Enter a password or turn password protection off." }
  }

  const payload = {
    ...data,
    files: data.files.map((file) => ({
      ...file,
      language: detectLanguage(file.name).id,
    })),
  }

  const paste = editing
    ? await store.updatePaste(editing, payload, "Edited")
    : await store.createPaste(payload)
  if (!paste) return { ok: false, error: "That paste no longer exists." }

  revalidatePath("/", "layout")
  return { ok: true, slug: paste.slug }
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
  await assertSignedIn()
  await store.updateSharing(slug, sharingSchema.parse(input))
  revalidatePath("/", "layout")
}

export async function setStarred(slug: string, starred: boolean) {
  await assertSignedIn()
  await store.setStarred(slug, starred)
  revalidatePath("/", "layout")
}

export async function renamePaste(slug: string, title: string) {
  await assertSignedIn()
  const parsed = pasteSchema.shape.title.safeParse(title)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the title." }
  }
  await store.renamePaste(slug, parsed.data)
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function setPasteCollection(slug: string, collection: string | null) {
  await assertSignedIn()
  if (collection !== null && !(await collectionExists(collection))) {
    return { ok: false as const, error: "That collection no longer exists." }
  }
  await store.setPasteCollection(slug, collection)
  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function trashPaste(slug: string) {
  await assertSignedIn()
  await store.trashPaste(slug)
  revalidatePath("/", "layout")
}

export async function restorePaste(slug: string) {
  await assertSignedIn()
  await store.restorePaste(slug)
  revalidatePath("/", "layout")
}

export async function deleteForever(slug: string) {
  await assertSignedIn()
  await store.deleteForever(slug)
  revalidatePath("/", "layout")
}

export async function emptyTrash() {
  await assertSignedIn()
  await store.emptyTrash()
  revalidatePath("/", "layout")
}

export type GistPreview = {
  id: string
  owner: GistOwner | null
  title: string
  // The paste size limit, in bytes and as the label the UI shows ("1 MB").
  limitBytes: number
  limitLabel: string
  files: { name: string; size: number; skipped: string | null }[]
}
export type GistPreviewResult = { ok: true; gist: GistPreview } | { ok: false; error: string }

// Reads a public GitHub gist (a gist URL or its id) and describes its files. Saves nothing.
export async function previewGist(input: string): Promise<GistPreviewResult> {
  const user = await assertSignedIn()

  const id = parseGistId(input)
  if (!id) return { ok: false, error: "Paste a gist link like gist.github.com/you/1a2b3c…" }

  const tooOften = await limited(limits.gist(user))
  if (tooOften) return { ok: false, error: tooOften }

  const result = await fetchGist(id)
  if (!result.ok) return result

  const { maxPasteBytes } = getConfig()
  const { gist } = result
  return {
    ok: true,
    gist: {
      id: gist.id,
      owner: gist.owner,
      title: gist.description ?? gist.files[0]?.name ?? "Imported gist",
      limitBytes: maxPasteBytes,
      limitLabel: formatLimit(maxPasteBytes),
      files: gist.files.map(({ name, size, skipped }) => ({ name, size, skipped })),
    },
  }
}

const importSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{20,40}$/i),
  files: z
    .array(z.string())
    .min(1, "Pick at least one file.")
    .max(10, "A paste can hold up to 10 files."),
})

// Copies the chosen files of a public GitHub gist into a new unlisted paste. The gist is read again, so
// what's saved is what GitHub has now, and it goes through the same checks as a paste saved in
// the editor.
export async function importGist(input: z.input<typeof importSchema>): Promise<SavePasteResult> {
  const user = await assertSignedIn()

  const choice = importSchema.safeParse(input)
  if (!choice.success) {
    return {
      ok: false,
      error: choice.error.issues[0]?.message ?? "Check the import and try again.",
    }
  }
  const { id, files: names } = choice.data

  const tooOften = await limited(limits.create(user))
  if (tooOften) return { ok: false, error: tooOften }

  const result = await fetchGist(id)
  if (!result.ok) return result
  const { gist } = result

  const read = await readGistFiles(gist, names)
  if (!read.ok) return read

  const parsed = pasteSchema.safeParse({
    title: gistTitle(gist, read.files[0]?.name),
    description: gistDescription(gist),
    files: read.files,
    visibility: "unlisted",
    expiry: "never",
    slug: "",
    collection: null,
    password: null,
    burnAfterRead: false,
  } satisfies SavePasteInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That gist couldn't be imported.",
    }
  }

  const paste = await store.createPaste({
    ...parsed.data,
    files: parsed.data.files.map((file) => ({
      ...file,
      language: detectLanguage(file.name).id,
    })),
  })

  revalidatePath("/", "layout")
  return { ok: true, slug: paste.slug }
}
