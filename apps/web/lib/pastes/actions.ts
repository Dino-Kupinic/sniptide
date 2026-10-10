"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { collectionExists } from "@/lib/collections/store"
import { hit, type Limit } from "@/lib/rate-limit"
import { getSiteOrigin } from "@/lib/site"
import { detectLanguage } from "./languages"
import * as store from "./store"
import { EXPIRIES, VISIBILITIES } from "./types"

async function assertSignedIn() {
  const session = await getSession()
  if (!session) throw new Error("Sign in to change pastes.")
  return session.user.id
}

const HOUR = 60 * 60

// Per-account limits, so one account can't fill the database or spend the server's GitHub quota.
const limits = {
  create: (user: string): Limit => ({ key: `paste:create:${user}`, max: 30, windowSeconds: HOUR }),
  edit: (user: string): Limit => ({ key: `paste:edit:${user}`, max: 240, windowSeconds: HOUR }),
  gist: (user: string): Limit => ({ key: `paste:gist:${user}`, max: 20, windowSeconds: HOUR }),
  slugCheck: (user: string): Limit => ({
    key: `paste:slug-check:${user}`,
    max: 600,
    windowSeconds: HOUR,
  }),
}

async function limited(...checks: Limit[]) {
  const result = await hit(checks)
  if (result.allowed) return null
  const minutes = Math.ceil(result.retryAfterSeconds / 60)
  return `You're doing that too often. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}

const MAX_BYTES = 512 * 1024

const pasteSchema = z.object({
  title: z.string().trim().min(1, "Give the paste a title.").max(120),
  description: z.string().trim().max(280),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Every file needs a name.").max(120),
        content: z.string(),
      }),
    )
    .min(1)
    .max(10, "A paste can hold up to 10 files.")
    .refine((files) => files.some((file) => file.content.trim()), "Paste some code first.")
    .refine(
      (files) => new Set(files.map((file) => file.name)).size === files.length,
      "File names must be unique.",
    )
    .refine(
      (files) => files.reduce((size, file) => size + file.content.length, 0) <= MAX_BYTES,
      "Pastes are limited to 512 KB.",
    ),
  visibility: z.enum(VISIBILITIES),
  expiry: z.enum([...EXPIRIES, "keep"]),
  slug: z.string().trim(),
  collection: z.string().nullable(),
  password: z.string().max(200).nullable(),
  burnAfterRead: z.boolean(),
})

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

const gistSchema = z.object({
  description: z.string().nullable(),
  files: z.record(
    z.string(),
    z.object({
      filename: z.string(),
      content: z.string().optional(),
      truncated: z.boolean().optional(),
    }),
  ),
})

// Copies a public GitHub gist into a new unlisted paste. Accepts a gist URL or its id. The copy
// goes through the same checks as a paste saved in the editor.
export async function importGist(input: string): Promise<SavePasteResult> {
  const user = await assertSignedIn()

  const id = input.trim().match(/([0-9a-f]{20,40})\/?(?:#.*)?$/i)?.[1]
  if (!id) return { ok: false, error: "Paste a gist link like gist.github.com/you/1a2b3c…" }

  const tooOften = await limited(limits.gist(user), limits.create(user))
  if (tooOften) return { ok: false, error: tooOften }

  const token = process.env.GITHUB_TOKEN
  const response = await fetch(`https://api.github.com/gists/${id}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "sniptide",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (response?.status === 404)
    return { ok: false, error: "That gist doesn't exist or isn't public." }
  if (!response?.ok) return { ok: false, error: "GitHub didn't answer. Try again in a minute." }

  const gist = gistSchema.safeParse(await response.json().catch(() => null))
  if (!gist.success) return { ok: false, error: "That gist couldn't be read." }

  const files = Object.values(gist.data.files)
    .filter((file) => file.content !== undefined && !file.truncated)
    .map((file) => ({ name: file.filename, content: file.content ?? "" }))
  if (files.length === 0)
    return { ok: false, error: "That gist has no files small enough to import." }

  const parsed = pasteSchema.safeParse({
    title: (gist.data.description?.trim() || files[0]?.name || "Imported gist").slice(0, 120),
    description: `Imported from gist ${id}`,
    files: files.slice(0, 10),
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
