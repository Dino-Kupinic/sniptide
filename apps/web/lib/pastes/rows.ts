import "server-only"

import { formatDate, timeAgo, timeUntil } from "@/lib/format"
import type { Locale } from "@/lib/i18n/config"
import { coreTranslator } from "@/lib/i18n/core"
import { DAY, HOUR } from "@/lib/time"
import { starredSlugs, TRASH_DAYS } from "./store"
import type { Access, PasteSummary, Person, Share } from "./types"

// Serializable rows for the paste tables. Labels are computed here on the server so the client
// tables receive only the fields they render.

export interface PasteRow {
  slug: string
  title: string
  language: string
  visibility: PasteSummary["visibility"]
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

function expiresLabel(paste: PasteSummary, now: number, locale: Locale) {
  const t = coreTranslator(locale)
  if (paste.burnAfterRead) return t("afterView")
  if (!paste.expiresAt) return t("never")
  return timeUntil(paste.expiresAt, now, locale)
}

function toRow(
  paste: PasteSummary,
  starred: ReadonlySet<string>,
  now: number,
  locale: Locale,
  canEdit = !paste.owner,
) {
  return {
    slug: paste.slug,
    title: paste.title,
    language: paste.language,
    visibility: paste.visibility,
    burnAfterRead: paste.burnAfterRead,
    views: paste.views,
    expiresLabel: expiresLabel(paste, now, locale),
    expiresSoon: Boolean(paste.expiresAt && paste.expiresAt - now < 48 * HOUR),
    expiresAt: paste.expiresAt,
    updatedAt: paste.updatedAt,
    updatedLabel: timeAgo(paste.updatedAt, now, locale),
    // A collection belongs to the paste's owner, so a starred paste shows none.
    collection: paste.owner ? null : paste.collection,
    starred: starred.has(paste.slug),
    owner: paste.owner,
    canEdit,
  } satisfies PasteRow
}

// Rows for a paste list. The viewer's stars load once for the whole list.
export async function toRows(pastes: PasteSummary[], locale: Locale = "en"): Promise<PasteRow[]> {
  const starred = await starredSlugs(pastes.map((paste) => paste.slug))
  const now = Date.now()
  return pastes.map((paste) => toRow(paste, starred, now, locale))
}

export async function toSharedRows(
  entries: { paste: PasteSummary; share: Share & { seen: boolean } }[],
  locale: Locale = "en",
): Promise<SharedRow[]> {
  const starred = await starredSlugs(entries.map(({ paste }) => paste.slug))
  const now = Date.now()
  return entries.map(({ paste, share }) => ({
    ...toRow(paste, starred, now, locale, share.access === "edit"),
    access: share.access,
    sharedAt: share.sharedAt,
    sharedLabel: timeAgo(share.sharedAt, now, locale),
    unseen: !share.seen,
  }))
}

export function toTrashRow(paste: PasteSummary, locale: Locale = "en"): TrashRow {
  const t = coreTranslator(locale)
  const now = Date.now()
  const deletedAt = paste.deletedAt ?? now
  const goneAt = deletedAt + TRASH_DAYS * DAY
  const daysLeft = Math.max(0, Math.ceil((goneAt - now) / DAY))
  const deletedToday = new Date(deletedAt).toDateString() === new Date(now).toDateString()

  return {
    slug: paste.slug,
    title: paste.title,
    language: paste.language,
    deletedAt,
    deletedLabel: deletedToday ? t("today") : formatDate(deletedAt, locale),
    goneLabel: daysLeft <= 1 ? t("tomorrow") : timeUntil(goneAt, now, locale),
    remaining: Math.min(1, Math.max(0, (goneAt - now) / (TRASH_DAYS * DAY))),
    goneSoon: daysLeft <= 1,
    bytes: paste.bytes,
  }
}
