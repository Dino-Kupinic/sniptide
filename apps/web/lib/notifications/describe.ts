import { timeUntil } from "@/lib/format"
import type { Locale } from "@/lib/i18n/config"
import { coreTranslator } from "@/lib/i18n/core"
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
export function describeNotification(
  row: NotificationRow,
  now = Date.now(),
  locale: Locale = "en",
) {
  const t = coreTranslator(locale)
  switch (row.kind) {
    case "shared":
      return {
        title: t("notificationShared", { name: row.actor ?? t("someone"), title: row.title }),
        detail: t("notificationSharedDetail"),
        href: `/pastes/${row.slug}`,
      }
    case "burned":
      return {
        title: t("notificationBurned", { title: row.title }),
        detail: t("notificationBurnedDetail"),
        href: "/trash",
      }
    case "expiring": {
      const title =
        row.expiresAt === null
          ? t("notificationNeverExpires", { title: row.title })
          : row.expiresAt <= now
            ? t("notificationExpired", { title: row.title })
            : t("notificationExpiring", {
                title: row.title,
                time: timeUntil(row.expiresAt, now, locale),
              })
      return {
        title,
        detail: t("notificationExpiringDetail"),
        href: `/pastes/${row.slug}`,
      }
    }
    case "views":
      return {
        title: t("notificationViews", { title: row.title, count: row.count ?? 0 }),
        detail: t("notificationViewsDetail"),
        href: `/analytics?paste=${encodeURIComponent(row.slug)}`,
      }
  }
}
