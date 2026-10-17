import "server-only"

import { notification, user } from "@workspace/db/schema"
import { inArray } from "drizzle-orm"
import type { getDb } from "@/lib/db"
import { parsePreferences } from "@/lib/preferences-schema"
import type { NotificationKind } from "./types"

type Executor = Pick<ReturnType<typeof getDb>, "insert" | "select">

export interface NewNotification {
  userId: string
  kind: NotificationKind
  pasteId: string
  actorId?: string
  count?: number
  dedupeKey?: string
}

export async function recordNotifications(db: Executor, inputs: readonly NewNotification[]) {
  if (!inputs.length) return 0
  const accounts = await db
    .select({ id: user.id, preferences: user.preferences })
    .from(user)
    .where(inArray(user.id, [...new Set(inputs.map((input) => input.userId))]))
  const preferences = new Map(
    accounts.map((account) => [account.id, parsePreferences(account.preferences)]),
  )
  const added = await db
    .insert(notification)
    .values(
      inputs.map((input) => {
        const channels = preferences.get(input.userId)?.notifications[input.kind]
        return {
          ...input,
          inApp: channels?.inApp ?? true,
          emailStatus: channels?.email ? ("pending" as const) : ("disabled" as const),
          emailNextAttemptAt: channels?.email ? new Date() : null,
        }
      }),
    )
    .onConflictDoNothing()
    .returning({ id: notification.id })
  return added.length
}
