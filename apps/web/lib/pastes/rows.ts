import "server-only"

import { byteLength, formatBytes, formatDate, timeAgo, timeUntil } from "@/lib/format"
import { isStarred, TRASH_DAYS } from "./store"
import type { Access, Paste, Person, Share } from "./types"

// Serializable rows for the paste tables. Labels are computed here on the server so the client
// tables only filter, sort and paginate.

const HOUR = 3_600_000
const DAY = 24 * HOUR

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

export async function toRow(paste: Paste, canEdit = !paste.owner): Promise<PasteRow> {
  const now = Date.now()
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
    collection: paste.collection,
    starred: await isStarred(paste.slug),
    owner: paste.owner,
    canEdit,
  }
}

export async function toSharedRow(
  paste: Paste,
  share: Share & { seen: boolean },
): Promise<SharedRow> {
  return {
    ...(await toRow(paste, share.access === "edit")),
    access: share.access,
    sharedAt: share.sharedAt,
    sharedLabel: timeAgo(share.sharedAt),
    unseen: !share.seen,
  }
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
