import "server-only"

import { paste as pasteTable, pasteViewDay } from "@workspace/db/schema"
import { and, desc, eq, gt, gte, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"
import { type PasteRow, toRows } from "./rows"
import { summarizePastes, VIEW_HISTORY_DAYS } from "./store"

const RECENT_ROWS = 5
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

export interface DashboardData {
  dailyViews: number[]
  dayNames: string[]
  dayDates: string[]
  newPastes: Record<"1" | "7" | "30", number>
  totalPastes: number
  activeLinks: number
  passwordProtected: number
  expiringSoon: number
  // At most five rows for each recent tab.
  recent: PasteRow[]
}

export async function getDashboardData(): Promise<DashboardData> {
  const viewer = (await getSession())?.user.id
  const now = Date.now()
  const today = Math.floor(now / DAY)
  const firstDay = today - VIEW_HISTORY_DAYS + 1
  const dailyViews = Array<number>(VIEW_HISTORY_DAYS).fill(0)
  const days = dailyViews.map((_, index) => (firstDay + index) * DAY)
  const empty: DashboardData = {
    dailyViews,
    dayNames: days.map((day) => weekday.format(day)),
    dayDates: days.map((day) => shortDate.format(day)),
    newPastes: { "1": 0, "7": 0, "30": 0 },
    totalPastes: 0,
    activeLinks: 0,
    passwordProtected: 0,
    expiringSoon: 0,
    recent: [],
  }
  if (!viewer) return empty
  const db = getDb()
  const own = and(eq(pasteTable.ownerId, viewer), isNull(pasteTable.deletedAt))
  const live = and(
    ne(pasteTable.visibility, "private"),
    or(isNull(pasteTable.expiresAt), gt(pasteTable.expiresAt, new Date(now))),
  )
  const [[totals], views, recentTabs] = await Promise.all([
    db
      .select({
        totalPastes: sql<number>`count(*)::int`,
        activeLinks: sql<number>`count(*) filter (where ${live})::int`,
        passwordProtected: sql<number>`count(*) filter (where ${and(live, isNotNull(pasteTable.passwordHash))})::int`,
        expiringSoon: sql<number>`count(*) filter (where ${and(gt(pasteTable.expiresAt, new Date(now)), lt(pasteTable.expiresAt, new Date(now + 2 * DAY)))})::int`,
        day: sql<number>`count(*) filter (where ${gt(pasteTable.createdAt, new Date(now - DAY))})::int`,
        week: sql<number>`count(*) filter (where ${gt(pasteTable.createdAt, new Date(now - 7 * DAY))})::int`,
        month: sql<number>`count(*) filter (where ${gt(pasteTable.createdAt, new Date(now - 30 * DAY))})::int`,
      })
      .from(pasteTable)
      .where(own),
    db
      .select({ day: pasteViewDay.day, views: sql<number>`sum(${pasteViewDay.views})::int` })
      .from(pasteViewDay)
      .innerJoin(pasteTable, eq(pasteViewDay.pasteId, pasteTable.id))
      .where(and(own, gte(pasteViewDay.day, firstDay), lt(pasteViewDay.day, today + 1)))
      .groupBy(pasteViewDay.day),
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
  for (const day of views) dailyViews[day.day - firstDay] = day.views
  const records = [
    ...new Map(recentTabs.flat().map((record) => [record.id, record])).values(),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
  const recent = await toRows(await summarizePastes(records, viewer))
  return {
    ...empty,
    dailyViews,
    totalPastes: totals?.totalPastes ?? 0,
    activeLinks: totals?.activeLinks ?? 0,
    passwordProtected: totals?.passwordProtected ?? 0,
    expiringSoon: totals?.expiringSoon ?? 0,
    newPastes: { "1": totals?.day ?? 0, "7": totals?.week ?? 0, "30": totals?.month ?? 0 },
    recent,
  }
}
