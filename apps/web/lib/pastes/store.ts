import "server-only"

import { seedPastes, seedShares, seedStarred, VIEW_HISTORY_DAYS } from "./seed"
import type { Expiry, Paste, PasteInput, Share, SharingInput } from "./types"

// In-memory paste store standing in for the D1 tables until they exist. It lives on globalThis
// so server actions and renders share it in dev; on Workers each isolate starts from the seed.
// Every signed-in account sees the same seeded workspace.

const DAY = 86_400_000
export const TRASH_DAYS = 30

const EXPIRY_MS: Record<Exclude<Expiry, "never">, number> = {
  "1h": 3_600_000,
  "1d": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
}

// Paths the app already uses, so a custom link can't shadow a page.
const RESERVED = new Set([
  "api",
  "collections",
  "dashboard",
  "new",
  "pastes",
  "settings",
  "shared",
  "sign-in",
  "sign-up",
  "starred",
  "trash",
  "raw",
  "_next",
])

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{3,40}$/

interface State {
  pastes: Map<string, Paste>
  shares: Map<string, Share & { seen: boolean }>
  starred: Set<string>
}

const globalStore = globalThis as typeof globalThis & { __sniptidePastes?: State }

function state(): State {
  if (!globalStore.__sniptidePastes) {
    const now = Date.now()
    globalStore.__sniptidePastes = {
      pastes: new Map(seedPastes(now).map((paste) => [paste.slug, paste])),
      shares: new Map(seedShares(now).map((share) => [share.slug, share])),
      starred: new Set(seedStarred),
    }
  }

  return globalStore.__sniptidePastes
}

function purgeTrash() {
  const cutoff = Date.now() - TRASH_DAYS * DAY
  for (const [slug, paste] of state().pastes) {
    if (paste.deletedAt && paste.deletedAt < cutoff) state().pastes.delete(slug)
  }
}

export function expiresAtFor(expiry: Expiry, from = Date.now()) {
  return expiry === "never" ? null : from + EXPIRY_MS[expiry]
}

function resolveExpiry(expiry: Expiry | "keep", current: number | null, from: number) {
  return expiry === "keep" ? current : expiresAtFor(expiry, from)
}

export function isExpired(paste: Paste) {
  return paste.expiresAt !== null && paste.expiresAt <= Date.now()
}

const byUpdated = (a: Paste, b: Paste) => b.updatedAt - a.updatedAt

export async function listOwnPastes() {
  return [...state().pastes.values()]
    .filter((paste) => !paste.owner && !paste.deletedAt)
    .sort(byUpdated)
}

export async function listTrash() {
  purgeTrash()
  return [...state().pastes.values()]
    .filter((paste) => !paste.owner && paste.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

export async function listShared() {
  return [...state().shares.values()]
    .map((share) => ({ share, paste: state().pastes.get(share.slug) }))
    .filter((entry): entry is { share: Share & { seen: boolean }; paste: Paste } =>
      Boolean(entry.paste && !entry.paste.deletedAt),
    )
    .sort((a, b) => b.share.sharedAt - a.share.sharedAt)
}

export async function listStarred() {
  return [...state().starred]
    .map((slug) => state().pastes.get(slug))
    .filter((paste): paste is Paste => Boolean(paste && !paste.deletedAt))
    .sort(byUpdated)
}

export async function isStarred(slug: string) {
  return state().starred.has(slug)
}

export async function getShare(slug: string) {
  return state().shares.get(slug) ?? null
}

export async function getPaste(slug: string) {
  const paste = state().pastes.get(slug)
  return paste && !paste.deletedAt ? paste : null
}

export async function navCounts() {
  return {
    pastes: (await listOwnPastes()).length,
    starred: (await listStarred()).length,
    shared: (await listShared()).length,
  }
}

export async function isSlugAvailable(slug: string, except?: string) {
  if (!SLUG_PATTERN.test(slug) || RESERVED.has(slug.toLowerCase())) return false
  return slug === except || !state().pastes.has(slug)
}

function randomSlug() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}

export async function createPaste(input: PasteInput) {
  let slug = input.slug
  if (!slug) {
    do slug = randomSlug()
    while (state().pastes.has(slug))
  }

  const now = Date.now()
  const paste: Paste = {
    slug,
    title: input.title,
    description: input.description,
    files: input.files,
    visibility: input.visibility,
    password: input.password,
    burnAfterRead: input.burnAfterRead,
    allowRaw: true,
    collection: input.collection,
    owner: null,
    views: 0,
    uniqueViews: 0,
    viewsByDay: Array(VIEW_HISTORY_DAYS).fill(0),
    createdAt: now,
    updatedAt: now,
    expiresAt: resolveExpiry(input.expiry, null, now),
    deletedAt: null,
    revisions: [{ message: "Created", createdAt: now }],
  }
  state().pastes.set(slug, paste)

  return paste
}

export async function updatePaste(slug: string, input: PasteInput, message: string) {
  const paste = await getPaste(slug)
  if (!paste) return null

  const now = Date.now()
  const updated: Paste = {
    ...paste,
    slug: input.slug || slug,
    title: input.title,
    description: input.description,
    files: input.files,
    visibility: input.visibility,
    // An empty password on edit keeps the existing one; the client never sees it.
    password: input.password === "" ? paste.password : input.password,
    burnAfterRead: input.burnAfterRead,
    collection: input.collection,
    expiresAt: resolveExpiry(input.expiry, paste.expiresAt, now),
    updatedAt: now,
    revisions: [{ message, createdAt: now }, ...paste.revisions],
  }

  state().pastes.delete(slug)
  state().pastes.set(updated.slug, updated)
  if (updated.slug !== slug && state().starred.delete(slug)) state().starred.add(updated.slug)

  return updated
}

export async function updateSharing(slug: string, input: SharingInput) {
  const paste = await getPaste(slug)
  if (!paste) return null

  const { expiry, ...rest } = input
  Object.assign(paste, rest, expiry ? { expiresAt: expiresAtFor(expiry) } : {})
  return paste
}

export async function setStarred(slug: string, starred: boolean) {
  if (starred) state().starred.add(slug)
  else state().starred.delete(slug)
}

export async function markShareSeen(slug: string) {
  const share = state().shares.get(slug)
  if (share) share.seen = true
}

export async function trashPaste(slug: string) {
  const paste = state().pastes.get(slug)
  if (paste && !paste.owner) paste.deletedAt = Date.now()
}

export async function restorePaste(slug: string) {
  const paste = state().pastes.get(slug)
  if (paste) paste.deletedAt = null
}

export async function deleteForever(slug: string) {
  const paste = state().pastes.get(slug)
  if (paste?.deletedAt) state().pastes.delete(slug)
}

export async function emptyTrash() {
  for (const paste of await listTrash()) state().pastes.delete(paste.slug)
}

// Counts a visit from the public page. Burn-after-read pastes go to the trash after the first
// view that isn't the owner's.
export async function recordView(slug: string) {
  const paste = await getPaste(slug)
  if (!paste) return

  paste.views += 1
  paste.uniqueViews += 1
  paste.viewsByDay[paste.viewsByDay.length - 1] = (paste.viewsByDay.at(-1) ?? 0) + 1
  if (paste.burnAfterRead) paste.deletedAt = Date.now()
}
