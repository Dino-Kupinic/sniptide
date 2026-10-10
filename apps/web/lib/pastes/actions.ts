"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { collectionExists } from "@/lib/collections/store"
import { getConfig } from "@/lib/config"
import { byteLength, formatLimit } from "@/lib/format"
import { hit, type Limit } from "@/lib/rate-limit"
import { getSiteOrigin } from "@/lib/site"
import { detectLanguage } from "./languages"
import { pasteSchema } from "./schema"
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

const GIST_LINK = /([0-9a-f]{20,40})\/?(?:#.*)?$/i
const RAW_HOST = "gist.githubusercontent.com"
const MAX_NAME = 120

const gistSchema = z.object({
  description: z.string().nullable(),
  updated_at: z.string().optional(),
  owner: z.object({ login: z.string() }).nullish(),
  files: z.record(
    z.string(),
    z.object({
      filename: z.string(),
      size: z.number().optional(),
      raw_url: z.string().optional(),
      content: z.string().optional(),
      truncated: z.boolean().optional(),
    }),
  ),
})

type GistFile = {
  name: string
  size: number
  // Inline text, when GitHub sent the whole file.
  content: string | null
  // Where to fetch the whole file when GitHub marked it truncated (over 1 MB inline).
  rawUrl: string | null
  // Why the file can't be imported, or null.
  skipped: string | null
}

type Gist = {
  id: string
  owner: string | null
  description: string | null
  updatedAt: string | null
  files: GistFile[]
}

function isRawUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === RAW_HOST
  } catch {
    return false
  }
}

function describeFile(file: z.infer<typeof gistSchema>["files"][string], limit: number): GistFile {
  const inline = file.content !== undefined && !file.truncated
  const size = inline ? byteLength(file.content ?? "") : (file.size ?? 0)
  const rawUrl = !inline && isRawUrl(file.raw_url) ? file.raw_url : null

  let skipped: string | null = null
  if (file.filename.length > MAX_NAME) skipped = `Name is over ${MAX_NAME} characters, left out.`
  else if (size > limit) skipped = `Over the ${formatLimit(limit)} limit, left out.`
  else if (!inline && !rawUrl) skipped = "Couldn't be read, left out."

  return {
    name: file.filename,
    size,
    content: inline ? (file.content ?? "") : null,
    rawUrl,
    skipped,
  }
}

type FetchGist = { ok: true; gist: Gist } | { ok: false; error: string }

async function fetchGist(id: string): Promise<FetchGist> {
  const { githubToken, maxPasteBytes } = getConfig()
  const response = await fetch(`https://api.github.com/gists/${id}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "sniptide",
      ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (response?.status === 404)
    return { ok: false, error: "That gist doesn't exist or isn't public." }
  if (!response?.ok) return { ok: false, error: "GitHub didn't answer. Try again in a minute." }

  const gist = gistSchema.safeParse(await response.json().catch(() => null))
  if (!gist.success) return { ok: false, error: "That gist couldn't be read." }

  const files = Object.values(gist.data.files).map((file) => describeFile(file, maxPasteBytes))
  if (files.length === 0) return { ok: false, error: "That gist has no files." }

  return {
    ok: true,
    gist: {
      id,
      owner: gist.data.owner?.login ?? null,
      description: gist.data.description?.trim() || null,
      updatedAt: gist.data.updated_at ?? null,
      files,
    },
  }
}

// The whole text of a file GitHub only sent part of, or null when it can't be fetched or turns
// out bigger than the limit.
async function fetchRaw(url: string, limit: number) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!response?.ok) return null
  const text = await response.text().catch(() => null)
  return text !== null && byteLength(text) <= limit ? text : null
}

export type GistPreview = {
  id: string
  owner: string | null
  title: string
  updatedAt: string | null
  // The paste size limit, in bytes and as the label the UI shows ("1 MB").
  limitBytes: number
  limitLabel: string
  files: { name: string; size: number; skipped: string | null }[]
}
export type GistPreviewResult = { ok: true; gist: GistPreview } | { ok: false; error: string }

// Reads a public GitHub gist (a gist URL or its id) and describes its files. Saves nothing.
export async function previewGist(input: string): Promise<GistPreviewResult> {
  const user = await assertSignedIn()

  const id = input.trim().match(GIST_LINK)?.[1]
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
      updatedAt: gist.updatedAt,
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
  visibility: z.enum(VISIBILITIES),
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
      error: choice.error.issues[0]?.message ?? "Check the import and try again.",
    }
  }
  const { id, files: names, visibility } = choice.data

  const tooOften = await limited(limits.create(user))
  if (tooOften) return { ok: false, error: tooOften }

  const result = await fetchGist(id)
  if (!result.ok) return result
  const { gist } = result

  const chosen: GistFile[] = []
  for (const name of new Set(names)) {
    const file = gist.files.find((candidate) => candidate.name === name)
    if (!file) return { ok: false, error: "That gist changed. Paste the link again to re-read it." }
    if (file.skipped) return { ok: false, error: `${file.name}: ${file.skipped}` }
    chosen.push(file)
  }

  const { maxPasteBytes } = getConfig()
  const files = await Promise.all(
    chosen.map(async (file) => ({
      name: file.name,
      content: file.content ?? (file.rawUrl ? await fetchRaw(file.rawUrl, maxPasteBytes) : null),
    })),
  )
  const unread = files.find((file) => file.content === null)
  if (unread) return { ok: false, error: `${unread.name} couldn't be read from GitHub.` }

  const parsed = pasteSchema.safeParse({
    title: (gist.description || files[0]?.name || "Imported gist").slice(0, MAX_NAME),
    description: `Imported from gist ${id}`,
    files: files.map((file) => ({ name: file.name, content: file.content ?? "" })),
    visibility,
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
