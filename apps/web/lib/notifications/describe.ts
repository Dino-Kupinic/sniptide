import { formatNumber, timeUntil } from "@/lib/format"
import type { NotificationKind } from "./types"

// The first view count that earns a notification is 10, then every 5 or 10 times that: 10, 50,
// 100, 500, 1,000, 5,000 and so on.
export function viewMilestone(views: number) {
  return views >= 10 && /^[15]0+$/.test(String(views))
}

export interface NotificationRow {
  kind: NotificationKind
  count: number | null
  title: string
  slug: string
  expiresAt: number | null
  actor: string | null
}

// The words and the link for one notification. Written when listing, from the paste as it is
// now, so a renamed paste or a changed expiry shows up in old notifications.
export function describeNotification(row: NotificationRow, now = Date.now()) {
  const quoted = `“${row.title}”`
  switch (row.kind) {
    case "shared":
      return {
        title: `${row.actor ?? "Someone"} shared ${quoted} with you`,
        detail: "Open it from Shared with me",
        href: `/pastes/${row.slug}`,
      }
    case "burned":
      return {
        title: `${quoted} was read`,
        detail: "It burned after reading. Restore it from the trash to keep it",
        href: "/trash",
      }
    case "expiring": {
      const title =
        row.expiresAt === null
          ? `${quoted} no longer expires`
          : row.expiresAt <= now
            ? `${quoted} has expired`
            : `${quoted} expires ${timeUntil(row.expiresAt, now)}`
      return {
        title,
        detail: "Extend it from the paste's sharing panel",
        href: `/pastes/${row.slug}`,
      }
    }
    case "views":
      return {
        title: `${quoted} reached ${formatNumber(row.count ?? 0)} views`,
        detail: "See where they came from in Analytics",
        href: `/analytics?paste=${encodeURIComponent(row.slug)}`,
      }
  }
}
