import "server-only"

import { USERNAME_PATTERN } from "@workspace/auth/username"
import { allowedPaste } from "@workspace/db/moderation"
import { paste, user } from "@workspace/db/schema"
import { and, count, desc, eq, gte, ilike, isNotNull, isNull, or, sql } from "drizzle-orm"
import { cache } from "react"
import { getDb } from "@/lib/db"
import { DEMO_USER_ID } from "@/lib/demo/guest"
import { initials } from "@/lib/format"
import { liveWhere } from "@/lib/pastes/lifecycle"
import { DAY } from "@/lib/time"

export const PROFILE_PAGE_SIZE = 20

export interface ProfilePaste {
  slug: string
  title: string
  language: string
  bytes: number
  createdAt: number
}

export interface Profile {
  // The normalized handle in the URL, and the one the owner chose to display.
  username: string
  displayUsername: string
  name: string
  image: string | null
  initials: string
  joinedAt: number
  pastes: ProfilePaste[]
  page: number
  pageCount: number
  // Pastes matching the search and language, and public pastes in all.
  total: number
  totalAll: number
  q: string
  language: string | null
  languages: string[]
  // Public pastes created per UTC day ("2026-11-04"), over the last ACTIVITY_DAYS days.
  activity: Record<string, number>
}

// The pastes a profile lists: the ones anyone could already find and open with no link, session,
// password or reveal step. Unlisted, private, password-protected and burn-after-read pastes stay
// off it, and so do trashed, expired and moderated ones.
export function profilePastesWhere(ownerId: string, now = new Date()) {
  return and(
    eq(paste.ownerId, ownerId),
    eq(paste.visibility, "public"),
    isNull(paste.passwordHash),
    eq(paste.burnAfterRead, false),
    isNotNull(paste.firstLanguage),
    allowedPaste(),
    liveWhere(now),
  )
}

// The account behind sniptide.com/@<handle>, matched without regard to case. Accounts that are
// only a pending invitation, and the shared demo guest, have no profile.
const findProfileOwner = cache(async (handle: string) => {
  const normalized = handle.toLowerCase()
  if (!USERNAME_PATTERN.test(normalized)) return null
  const [row] = await getDb()
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      username: user.username,
      displayUsername: user.displayUsername,
      createdAt: user.createdAt,
      pendingInvitation: user.pendingInvitation,
    })
    .from(user)
    .where(sql`lower(${user.username}) = ${normalized}`)
    .limit(1)
  if (!row?.username || row.pendingInvitation || row.id === DEMO_USER_ID) return null
  return { ...row, username: row.username }
})

export interface ProfileQuery {
  page?: number
  // Matches the title or the link, without regard to case.
  q?: string
  // A language id, such as "typescript": only pastes whose first file is in it.
  language?: string
}

export const PROFILE_QUERY_MAX = 100
// The activity grid's span: 53 weeks, so the oldest column is a full week.
export const ACTIVITY_DAYS = 53 * 7

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// A public profile with one page of its pastes, newest first, narrowed by an optional search and
// language. The activity grid and the language options always cover every public paste. Null when
// the handle has no profile, or the page is past the last one.
export const readProfile = cache(
  async (handle: string, query: ProfileQuery = {}): Promise<Profile | null> => {
    const page = query.page ?? 1
    if (!Number.isSafeInteger(page) || page < 1) return null
    const owner = await findProfileOwner(handle)
    if (!owner) return null
    const db = getDb()
    const now = new Date()
    const everything = profilePastesWhere(owner.id, now)
    const q = query.q?.trim().slice(0, PROFILE_QUERY_MAX) ?? ""
    const pattern = `%${escapeLike(q)}%`
    const where = and(
      everything,
      q ? or(ilike(paste.title, pattern), ilike(paste.slug, pattern)) : undefined,
      query.language ? eq(paste.firstLanguage, query.language) : undefined,
    )
    const since = new Date(now.getTime() - ACTIVITY_DAYS * DAY)
    const day = sql<string>`to_char(${paste.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`
    const [[totals], [all], rows, languages, activity] = await Promise.all([
      db.select({ total: count() }).from(paste).where(where),
      db.select({ total: count() }).from(paste).where(everything),
      db
        .select({
          slug: paste.slug,
          title: paste.title,
          language: paste.firstLanguage,
          bytes: paste.bytes,
          createdAt: paste.createdAt,
        })
        .from(paste)
        .where(where)
        .orderBy(desc(paste.createdAt), desc(paste.id))
        .limit(PROFILE_PAGE_SIZE)
        .offset((page - 1) * PROFILE_PAGE_SIZE),
      db
        .selectDistinct({ language: paste.firstLanguage })
        .from(paste)
        .where(everything)
        .orderBy(paste.firstLanguage),
      db
        .select({ day, count: count() })
        .from(paste)
        .where(and(everything, gte(paste.createdAt, since)))
        .groupBy(day),
    ])
    const total = totals?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PROFILE_PAGE_SIZE))
    if (page > pageCount) return null
    return {
      username: owner.username,
      displayUsername: owner.displayUsername ?? owner.username,
      name: owner.name,
      image: owner.image,
      initials: initials(owner.name),
      joinedAt: owner.createdAt.getTime(),
      pastes: rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        language: row.language ?? "text",
        bytes: row.bytes,
        createdAt: row.createdAt.getTime(),
      })),
      page,
      pageCount,
      total,
      totalAll: all?.total ?? 0,
      q,
      language: query.language ?? null,
      languages: languages.flatMap((row) => (row.language ? [row.language] : [])),
      activity: Object.fromEntries(activity.map((row) => [row.day, row.count])),
    }
  },
)
