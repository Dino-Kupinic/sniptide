"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { collections } from "@/lib/mock-data"
import { detectLanguage } from "./languages"
import * as store from "./store"
import { unlockCookieName, unlockToken } from "./unlock"

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
  collection: z
    .string()
    .nullable()
    .refine((slug) => slug === null || collections.some((c) => c.slug === slug)),
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
    return { ok: false, error: `sniptide.com/${data.slug} is taken or not allowed.` }
  }
  // On edit an empty password means "keep the current one"; a new paste needs a real one.
  const current = editing ? await store.getPaste(editing) : null
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

// Password gate on the public page. The cookie holds a hash of slug and password, so it stops
// working when the password changes and can't be minted without knowing it.
export async function unlockPaste(slug: string, password: string) {
  const paste = await store.getPaste(slug)
  if (!paste?.password || paste.password !== password) {
    return { ok: false as const, error: "That password isn't right." }
  }

  const jar = await cookies()
  jar.set(unlockCookieName(slug), await unlockToken(slug, password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return { ok: true as const }
}
