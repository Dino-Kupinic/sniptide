import type { Database } from "@workspace/db"
import { user } from "@workspace/db/schema"
import { eq, inArray, or, sql } from "drizzle-orm"
import { toUsername } from "./username"

// Used when no candidate gives a valid username.
const FALLBACK = "user"

// Picks a free username for an account created without one, which is every GitHub or Google
// sign-up. The first candidate that is free wins; otherwise the first usable one gets the lowest
// free numbered suffix ("dino-2"). Email addresses never serve as a candidate, since the username
// shows on the public profile.
export async function generateUsername(db: Database, candidates: (string | null | undefined)[]) {
  const usable = [...new Set(candidates.map(toUsername).filter((value) => value !== null))]
  if (usable.length) {
    const taken = new Set(
      (
        await db
          .select({ username: user.username })
          .from(user)
          .where(inArray(user.username, usable))
      ).map((row) => row.username),
    )
    const free = usable.find((value) => !taken.has(value))
    if (free) return free
  }

  // Leaves room for a suffix of up to five digits within the 30-character limit.
  const base = (usable[0] ?? FALLBACK).slice(0, 24).replace(/[-_]+$/, "")
  const prefix = `${base}-`
  const rows = await db
    .select({ username: user.username })
    .from(user)
    .where(or(eq(user.username, base), sql`starts_with(${user.username}, ${prefix})`))
  const taken = new Set(rows.map((row) => row.username))
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${prefix}${suffix}`)) suffix++
  return `${prefix}${suffix}`
}
