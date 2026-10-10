import "server-only"

import { byteLength, formatBytes, formatDate, timeAgo, timeUntil } from "@/lib/format"
import { DAY, HOUR } from "@/lib/time"
import { starredSlugs, TRASH_DAYS } from "./store"
import type { Access, Paste, Person, Share } from "./types"

// Serializable rows for the paste tables. Labels are computed here on the server so the client
// tables only filter, sort and paginate.

export interface PasteRow {
  slug: string
  title: string
  language: string
  visibility: Paste["visibility"]
  burnAfterRead: boolean
  views: number
  expiresLabel: string
  // Expiring within 48 hours: highlighted in the tables and counted on the dashboard.
  expiresSoon: boolean
  expiresAt: number | null
  updatedAt: number
  updatedLabel: string
  collection: string | null
  starred: boolean
  owner: Person | null
  canEdit: boolean
}

export interface SharedRow extends PasteRow {
  access: Access
  sharedAt: number
  sharedLabel: string
  unseen: boolean
}

export interface TrashRow {
  slug: string
  title: string
  language: string
  deletedAt: number
  deletedLabel: string
  goneLabel: string
  // Share of the 30 days still left, for the "Gone for good" bar.
  remaining: number
  goneSoon: boolean
  bytes: number
}

function expiresLabel(paste: Paste, now: number) {
  if (paste.burnAfterRead) return "after 1 view"
  if (!paste.expiresAt) return "Never"
  return timeUntil(paste.expiresAt, now)
}

function toRow(paste: Paste, starred: ReadonlySet<string>, now: number, canEdit = !paste.owner) {
  return {
    slug: paste.slug,
    title: paste.title,
    language: paste.files[0]?.language ?? "text",
    visibility: paste.visibility,
    burnAfterRead: paste.burnAfterRead,
    views: paste.views,
    expiresLabel: expiresLabel(paste, now),
    expiresSoon: Boolean(paste.expiresAt && paste.expiresAt - now < 48 * HOUR),
    expiresAt: paste.expiresAt,
    updatedAt: paste.updatedAt,
    updatedLabel: timeAgo(paste.updatedAt, now),
    // A collection belongs to the paste's owner, so a starred paste shows none.
    collection: paste.owner ? null : paste.collection,
    starred: starred.has(paste.slug),
    owner: paste.owner,
    canEdit,
  } satisfies PasteRow
}

// Rows for a paste list. The viewer's stars load once for the whole list.
export async function toRows(pastes: Paste[]): Promise<PasteRow[]> {
  const starred = await starredSlugs()
  const now = Date.now()
  return pastes.map((paste) => toRow(paste, starred, now))
}

export async function toSharedRows(
  entries: { paste: Paste; share: Share & { seen: boolean } }[],
): Promise<SharedRow[]> {
  const starred = await starredSlugs()
  const now = Date.now()
  return entries.map(({ paste, share }) => ({
    ...toRow(paste, starred, now, share.access === "edit"),
    access: share.access,
    sharedAt: share.sharedAt,
    sharedLabel: timeAgo(share.sharedAt, now),
    unseen: !share.seen,
  }))
}

export function toTrashRow(paste: Paste): TrashRow {
  const now = Date.now()
  const deletedAt = paste.deletedAt ?? now
  const goneAt = deletedAt + TRASH_DAYS * DAY
  const daysLeft = Math.max(0, Math.ceil((goneAt - now) / DAY))
  const deletedToday = new Date(deletedAt).toDateString() === new Date(now).toDateString()

  return {
    slug: paste.slug,
    title: paste.title,
    language: paste.files[0]?.language ?? "text",
    deletedAt,
    deletedLabel: deletedToday ? "Today" : formatDate(deletedAt),
    goneLabel: daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`,
    remaining: Math.min(1, Math.max(0, (goneAt - now) / (TRASH_DAYS * DAY))),
    goneSoon: daysLeft <= 1,
    bytes: paste.files.reduce((size, file) => size + byteLength(file.content), 0),
  }
}

export function trashSizeLabel(rows: TrashRow[]) {
  return formatBytes(rows.reduce((size, row) => size + row.bytes, 0))
}
