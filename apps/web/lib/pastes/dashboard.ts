import "server-only"

import { allowedPaste } from "@workspace/db/moderation"

import { paste as pasteTable } from "@workspace/db/schema"
import { and, asc, desc, eq, gt, isNull, lte, type SQL, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import type { Collection } from "@/lib/collections/types"
import { DEFAULT_LAYOUT, type WidgetId } from "@/lib/dashboard/widgets"
import { getDb } from "@/lib/db"
import { listSecrets, type SecretSummary } from "@/lib/env/web-store"
import type { Locale } from "@/lib/i18n/config"
import { DAY } from "@/lib/time"
import { parsePasteListQuery } from "./list-query"
import { listPastePage } from "./lists"
import { type PasteRow, toRows } from "./rows"
import { summarizePastes } from "./store"

// Each list widget shows this many rows and links to the full page for the rest.
export const WIDGET_ROWS = 5
// How far ahead the dashboard warns about an expiry, matching the expiring-paste notification.
export const EXPIRING_WINDOW_MS = 2 * DAY

export type DashboardSecret = Pick<SecretSummary, "id" | "slug" | "environment" | "count">

export interface DashboardData {
  // Live pastes whose links stop working within EXPIRING_WINDOW_MS.
  expiringSoon: number
  // Pastes whose expiry passed and that wait for the purge job (lib/pastes/lifecycle.ts).
  expired: number
  // The rows of each widget on the layout. A widget that isn't on it is left out.
  // Recent pastes holds at most five rows for each of its tabs.
  recent?: PasteRow[]
  starred?: PasteRow[]
  expiring?: PasteRow[]
  popular?: PasteRow[]
  secrets?: DashboardSecret[]
  collections?: Collection[]
}

export async function getDashboardData(
  locale: Locale = "en",
  layout: readonly WidgetId[] = DEFAULT_LAYOUT,
): Promise<DashboardData> {
  const viewer = (await getSession())?.user.id
  if (!viewer) return { expiringSoon: 0, expired: 0 }
  const db = getDb()
  const now = new Date()
  const own = and(allowedPaste(), eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))
  const has = (widget: WidgetId) => layout.includes(widget)

  const ownRows = async (where: SQL | undefined, order: SQL[]) => {
    const records = await db
      .select()
      .from(pasteTable)
      .where(and(own, where))
      .orderBy(...order, pasteTable.id)
      .limit(WIDGET_ROWS)
    return toRows(await summarizePastes(records, viewer), locale)
  }

  const recent = async () => {
    const tabs = await Promise.all(
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
          .limit(WIDGET_ROWS),
      ),
    )
    const records = [...new Map(tabs.flat().map((record) => [record.id, record])).values()].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id),
    )
    return toRows(await summarizePastes(records, viewer), locale)
  }

  const starred = async () => {
    const page = await listPastePage({ mode: "starred" }, parsePasteListQuery({}))
    return toRows(page.pastes.slice(0, WIDGET_ROWS), locale)
  }

  const secrets = async (): Promise<DashboardSecret[]> =>
    (await listSecrets(viewer))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, WIDGET_ROWS)
      .map(({ id, slug, environment, count }) => ({ id, slug, environment, count }))

  const [[counts], widgets] = await Promise.all([
    db
      .select({
        expiringSoon: sql<number>`count(*) filter (where ${and(gt(pasteTable.expiresAt, now), lte(pasteTable.expiresAt, new Date(now.getTime() + EXPIRING_WINDOW_MS)))})::int`,
        expired: sql<number>`count(*) filter (where ${lte(pasteTable.expiresAt, now)})::int`,
      })
      .from(pasteTable)
      .where(own),
    Promise.all([
      has("recent_pastes") ? recent() : undefined,
      has("starred") ? starred() : undefined,
      has("expiring")
        ? ownRows(gt(pasteTable.expiresAt, now), [asc(pasteTable.expiresAt)])
        : undefined,
      has("popular")
        ? ownRows(gt(pasteTable.views, 0), [desc(pasteTable.views), desc(pasteTable.updatedAt)])
        : undefined,
      has("secrets") ? secrets() : undefined,
      has("collections") ? listCollections() : undefined,
    ]),
  ])
  const [recentRows, starredRows, expiring, popular, secretRows, collections] = widgets
  return {
    expiringSoon: counts?.expiringSoon ?? 0,
    expired: counts?.expired ?? 0,
    recent: recentRows,
    starred: starredRows,
    expiring,
    popular,
    secrets: secretRows,
    collections,
  }
}
