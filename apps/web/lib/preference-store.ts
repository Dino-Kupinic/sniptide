import "server-only"

import { user } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import type { Preferences } from "./preferences"
import { parsePreferences } from "./preferences-schema"

export async function readPreferences(userId: string) {
  const [row] = await getDb()
    .select({ preferences: user.preferences })
    .from(user)
    .where(eq(user.id, userId))
  return parsePreferences(row?.preferences)
}

export async function changePreferences(
  userId: string,
  change: (current: Preferences) => Preferences,
  expectedEmail?: string,
) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ preferences: user.preferences, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .for("update")
    if (!row || (expectedEmail !== undefined && row.email !== expectedEmail)) return false
    await tx
      .update(user)
      .set({ preferences: JSON.stringify(change(parsePreferences(row.preferences))) })
      .where(eq(user.id, userId))
    return true
  })
}
