import "server-only"

import { notification } from "@workspace/db/schema"
import type { getDb } from "@/lib/db"
import type { NotificationKind } from "./types"

// The database or a transaction on it, so a notification can be written in the same transaction
// as the event it reports.
type Executor = Pick<ReturnType<typeof getDb>, "insert">

export interface NewNotification {
  userId: string
  kind: NotificationKind
  pasteId: string
  actorId?: string
  count?: number
  dedupeKey?: string
}

// Adds a notification. One with a dedupe key that already exists for that account is skipped.
export async function recordNotification(db: Executor, input: NewNotification) {
  await db
    .insert(notification)
    .values({
      userId: input.userId,
      kind: input.kind,
      pasteId: input.pasteId,
      actorId: input.actorId ?? null,
      count: input.count ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing()
}
