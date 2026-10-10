"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { collectionExists } from "@/lib/collections/store"
import { getSiteOrigin } from "@/lib/site"
import { detectLanguage } from "./languages"
import * as store from "./store"

async function assertSignedIn() {
  if (!(await getSession())) throw new Error("Sign in to change pastes.")
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
  visibility: z.enum(["public", "unlisted", "private"]),
  expiry: z.enum(["1h", "1d", "1w", "1m", "never", "keep"]),
  slug: z.string().trim(),
  collection: z.string().nullable(),
  password: z.string().max(200).nullable(),
  burnAfterRead: z.boolean(),
})

export type SavePasteInput = z.input<typeof pasteSchema>
export type SavePasteResult = { ok: true; slug: string } | { ok: false; error: string }

// Creates a paste, or updates `editing` when given. Returns the slug to navigate to.
export async function savePaste(input: SavePasteInput, editing?: string): Promise<SavePasteResult> {
  await assertSignedIn()

  const parsed = pasteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the paste and try again." }
  }

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

export async function checkSlug(slug: string, except?: string) {
  await assertSignedIn()
  return store.isSlugAvailable(slug, except)
}

const sharingSchema = z.object({
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  expiry: z.enum(["1h", "1d", "1w", "1m", "never"]).optional(),
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

// Copies a public GitHub gist into a new unlisted paste. Accepts a gist URL or its id.
export async function importGist(input: string): Promise<SavePasteResult> {
  await assertSignedIn()

  const id = input.trim().match(/([0-9a-f]{20,40})\/?(?:#.*)?$/i)?.[1]
  if (!id) return { ok: false, error: "Paste a gist link like gist.github.com/you/1a2b3c…" }

  const response = await fetch(`https://api.github.com/gists/${id}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "sniptide" },
  })
  if (response.status === 404)
    return { ok: false, error: "That gist doesn't exist or isn't public." }
  if (!response.ok) return { ok: false, error: "GitHub didn't answer. Try again in a minute." }

  const gist = gistSchema.safeParse(await response.json())
  if (!gist.success) return { ok: false, error: "That gist couldn't be read." }

  const files = Object.values(gist.data.files)
    .filter((file) => file.content !== undefined && !file.truncated)
    .slice(0, 10)
    .map((file) => ({
      name: file.filename,
      content: file.content ?? "",
      language: detectLanguage(file.filename).id,
    }))
  if (files.length === 0)
    return { ok: false, error: "That gist has no files small enough to import." }

  const paste = await store.createPaste({
    title: gist.data.description?.trim() || files[0]?.name || "Imported gist",
    description: `Imported from gist ${id}`,
    files,
    visibility: "unlisted",
    expiry: "never",
    slug: "",
    collection: null,
    password: null,
    burnAfterRead: false,
  })

  revalidatePath("/", "layout")
  return { ok: true, slug: paste.slug }
}
