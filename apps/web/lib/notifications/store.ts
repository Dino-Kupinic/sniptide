import "server-only"

import { notification, paste, user } from "@workspace/db/schema"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import type { Locale } from "@/lib/i18n/config"
import { describeNotification } from "./describe"
import type { NotificationFeed } from "./types"

// How many notifications the bell lists. Older ones are still counted as unread, and the
// retention job removes them in time.
export const NOTIFICATION_LIMIT = 20

// The signed-in account's notifications, newest first, or null without a session.
export async function listNotifications(
  now = Date.now(),
  locale: Locale = "en",
): Promise<NotificationFeed | null> {
  const viewer = (await getSession())?.user.id
  if (!viewer) return null
  const db = getDb()
  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: notification.id,
        kind: notification.kind,
        count: notification.count,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
        title: paste.title,
        slug: paste.slug,
        expiresAt: paste.expiresAt,
        actor: user.name,
      })
      .from(notification)
      .innerJoin(paste, eq(paste.id, notification.pasteId))
      .leftJoin(user, eq(user.id, notification.actorId))
      .where(and(eq(notification.userId, viewer), eq(notification.inApp, true)))
      .orderBy(desc(notification.createdAt), desc(notification.id))
      .limit(NOTIFICATION_LIMIT),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notification)
      .where(
        and(
          eq(notification.userId, viewer),
          eq(notification.inApp, true),
          isNull(notification.readAt),
        ),
      ),
  ])
  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      createdAt: row.createdAt.getTime(),
      read: row.readAt !== null,
      ...describeNotification(
        {
          kind: row.kind,
          count: row.count,
          title: row.title,
          slug: row.slug,
          expiresAt: row.expiresAt?.getTime() ?? null,
          actor: row.actor,
        },
        now,
        locale,
      ),
    })),
    unread: counted?.unread ?? 0,
  }
}

// Marks one of the viewer's notifications read. Reading it twice, or someone else's, changes
// nothing.
export async function markNotificationRead(id: string) {
  const viewer = (await getSession())?.user.id
  if (!viewer) return false
  await getDb()
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.id, id),
        eq(notification.userId, viewer),
        eq(notification.inApp, true),
        isNull(notification.readAt),
      ),
    )
  return true
}

export async function markAllNotificationsRead() {
  const viewer = (await getSession())?.user.id
  if (!viewer) return false
  await getDb()
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.userId, viewer),
        eq(notification.inApp, true),
        isNull(notification.readAt),
      ),
    )
  return true
}

// Removes one of the viewer's notifications from the bell. The row stays (hidden from the bell and
// marked read) so a pending email still goes out, and the maintenance job deletes it with the
// other read ones. Someone else's notification, or one already removed, changes nothing.
export async function dismissNotification(id: string) {
  const viewer = (await getSession())?.user.id
  if (!viewer) return false
  await getDb()
    .update(notification)
    .set({ inApp: false, readAt: sql`coalesce(${notification.readAt}, now())` })
    .where(
      and(eq(notification.id, id), eq(notification.userId, viewer), eq(notification.inApp, true)),
    )
  return true
}
