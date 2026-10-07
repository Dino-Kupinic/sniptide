import "server-only"

import { type PasteRow, toRow } from "./rows"
import { VIEW_HISTORY_DAYS } from "./seed"
import { isExpired, listOwnPastes } from "./store"

const DAY = 86_400_000
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
  recent: PasteRow[]
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
    passwordProtected: live.filter((paste) => paste.password).length,
    expiringSoon: pastes.filter(
      (paste) => paste.expiresAt && paste.expiresAt > now && paste.expiresAt - now < 2 * DAY,
    ).length,
    recent: await Promise.all(pastes.map((paste) => toRow(paste))),
  }
}
