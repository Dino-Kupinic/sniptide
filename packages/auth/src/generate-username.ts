import type { Database } from "@workspace/db"
import { rateLimit, user } from "@workspace/db/schema"
import { eq, inArray, or, sql } from "drizzle-orm"
import { transliterate } from "transliteration"
import { toUsername } from "./username"

// Used when no candidate gives a valid username.
const FALLBACK = "user"

// How long a picked username stays claimed for the sign-up that picked it. The account row is
// written in the same request, seconds after the pick.
const CLAIM_SECONDS = 60

// Numbered names tried after the plain ones before a random suffix takes over.
const MAX_NUMBERED = 50

export function toGeneratedUsername(value: string | null | undefined) {
  return value ? toUsername(transliterate(value)) : null
}

// Claims `name` for one sign-up, so two concurrent sign-ups can't both pick it before either
// account row exists. Better Auth writes the row later, in its own transaction, so the claim can't
// share a transaction with the insert. It lives in `rate_limit` as a counter whose window is the
// claim: an expired claim is taken over, and the hourly purge removes old ones.
async function claim(db: Database, name: string) {
  const fresh = sql`${rateLimit.windowStart} <= now() - make_interval(secs => ${CLAIM_SECONDS})`
  const rows = await db
    .insert(rateLimit)
    .values({ key: `username-claim:${name}`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: { windowStart: sql`now()`, count: 1 },
      setWhere: fresh,
    })
    .returning({ key: rateLimit.key })
  return rows.length > 0
}

// The first candidate in `names` that no account has and no other sign-up has claimed.
async function claimFirstFree(db: Database, names: string[]) {
  if (names.length === 0) return null
  const taken = new Set(
    (
      await db.select({ username: user.username }).from(user).where(inArray(user.username, names))
    ).map((row) => row.username),
  )
  for (const name of names) if (!taken.has(name) && (await claim(db, name))) return name
  return null
}

// Picks a free username for an account created without one, which is every GitHub or Google
// sign-up. The first candidate that is free wins; otherwise the first usable one gets the lowest
// free numbered suffix ("dino-2"). Email addresses never serve as a candidate, since the username
// shows on the public profile.
export async function generateUsername(db: Database, candidates: (string | null | undefined)[]) {
  const usable = [...new Set(candidates.map(toGeneratedUsername).filter((value) => value !== null))]
  const plain = await claimFirstFree(db, usable)
  if (plain) return plain

  // Leaves room for a suffix of up to five digits within the 30-character limit.
  const base = (usable[0] ?? FALLBACK).slice(0, 24).replace(/[-_]+$/, "")
  const prefix = `${base}-`
  const rows = await db
    .select({ username: user.username })
    .from(user)
    .where(or(eq(user.username, base), sql`starts_with(${user.username}, ${prefix})`))
  const taken = new Set(rows.map((row) => row.username))
  const numbered: string[] = []
  if (!taken.has(base)) numbered.push(base)
  for (let suffix = 2; numbered.length < MAX_NUMBERED; suffix++)
    if (!taken.has(`${prefix}${suffix}`)) numbered.push(`${prefix}${suffix}`)
  const next = await claimFirstFree(db, numbered)
  if (next) return next
  // Only a burst of sign-ups with one name gets here. A random suffix ends the search, and the
  // unique index still guards the insert.
  return `${prefix}${Math.floor(10_000 + Math.random() * 90_000)}`
}
