import "server-only"

import { allowedPaste } from "@workspace/db/moderation"

import { paste as pasteTable } from "@workspace/db/schema"
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import type { Locale } from "@/lib/i18n/config"
import { DAY } from "@/lib/time"
import { type PasteRow, toRows } from "./rows"
import { summarizePastes } from "./store"

const RECENT_ROWS = 5
// How far ahead the dashboard warns about an expiry, matching the expiring-paste notification.
export const EXPIRING_WINDOW_MS = 2 * DAY

export interface DashboardData {
  // Live pastes whose links stop working within EXPIRING_WINDOW_MS.
  expiringSoon: number
  // Pastes whose expiry passed and that wait for the purge job (lib/pastes/lifecycle.ts).
  expired: number
  // At most five rows for each recent tab.
  recent: PasteRow[]
}

export async function getDashboardData(locale: Locale = "en"): Promise<DashboardData> {
  const empty: DashboardData = { expiringSoon: 0, expired: 0, recent: [] }
  const viewer = (await getSession())?.user.id
  if (!viewer) return empty
  const db = getDb()
  const now = new Date()
  const own = and(allowedPaste(), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))
  const [[counts], recentTabs] = await Promise.all([
    db
      .select({
        expiringSoon: sql<number>`count(*) filter (where ${and(gt(pasteTable.expiresAt, now), lte(pasteTable.expiresAt, new Date(now.getTime() + EXPIRING_WINDOW_MS)))})::int`,
        expired: sql<number>`count(*) filter (where ${lte(pasteTable.expiresAt, now)})::int`,
      })
      .from(pasteTable)
      .where(own),
    Promise.all(
      [undefined, ...(["public", "unlisted", "private"] as const)].map((visibility) =>
        db
          .select()
          .from(pasteTable)
          .where(
            and(
              own,
              visibility
                ? and(eq(pasteTable.visibility, visibility), eq(pasteTable.burnAfterRead, false))
                : undefined,
            ),
          )
          .orderBy(desc(pasteTable.updatedAt), pasteTable.id)
          .limit(RECENT_ROWS),
      ),
    ),
  ])
  const records = [
    ...new Map(recentTabs.flat().map((record) => [record.id, record])).values(),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
  const recent = await toRows(await summarizePastes(records, viewer), locale)
  return {
    expiringSoon: counts?.expiringSoon ?? 0,
    expired: counts?.expired ?? 0,
    recent,
  }
}
