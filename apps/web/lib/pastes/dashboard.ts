import "server-only"

import { type PasteRow, toRow } from "./rows"
import { isExpired, listOwnPastes, VIEW_HISTORY_DAYS } from "./store"

const DAY = 86_400_000
// Rows the dashboard's recent table shows per tab (all, public, unlisted, private).
const RECENT_ROWS = 5
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

export interface DashboardData {
  // Views across the viewer's pastes per day, oldest first, today last.
  dailyViews: number[]
  // Labels for each of those days ("Thu", "Oct 7").
  dayNames: string[]
  dayDates: string[]
  pasteCreatedAt: number[]
  totalPastes: number
  activeLinks: number
  passwordProtected: number
  expiringSoon: number
  // The newest RECENT_ROWS of each tab, newest first.
  recent: PasteRow[]
}

// Enough rows for every tab of the recent table without sending the whole list.
function recentRows(rows: PasteRow[]) {
  const tabs = [
    () => true,
    ...(["public", "unlisted", "private"] as const).map(
      (visibility) => (row: PasteRow) => row.visibility === visibility && !row.burnAfterRead,
    ),
  ]
  const kept = new Set(tabs.flatMap((matches) => rows.filter(matches).slice(0, RECENT_ROWS)))
  return rows.filter((row) => kept.has(row))
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = Date.now()
  const pastes = await listOwnPastes()

  const dailyViews = Array<number>(VIEW_HISTORY_DAYS).fill(0)
  for (const paste of pastes) {
    paste.viewsByDay.forEach((views, index) => {
      const day = index - paste.viewsByDay.length + VIEW_HISTORY_DAYS
      if (day >= 0) dailyViews[day] = (dailyViews[day] ?? 0) + views
    })
  }

  const days = dailyViews.map((_, index) => now - (VIEW_HISTORY_DAYS - 1 - index) * DAY)
  const live = pastes.filter((paste) => !isExpired(paste) && paste.visibility !== "private")

  return {
    dailyViews,
    dayNames: days.map((day) => weekday.format(day)),
    dayDates: days.map((day) => shortDate.format(day)),
    pasteCreatedAt: pastes.map((paste) => paste.createdAt),
    totalPastes: pastes.length,
    activeLinks: live.length,
    passwordProtected: live.filter((paste) => paste.hasPassword).length,
    expiringSoon: pastes.filter(
      (paste) => paste.expiresAt && paste.expiresAt > now && paste.expiresAt - now < 2 * DAY,
    ).length,
    recent: recentRows(pastes.map((paste) => toRow(paste))),
  }
}
