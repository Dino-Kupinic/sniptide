import "server-only"

import { randomBytes, randomUUID } from "node:crypto"
import type { Database } from "@workspace/db"
import { envInteger } from "@workspace/db/config"
import {
  account,
  apiToken,
  apiTokenUsageDay,
  collection,
  envGroup,
  notification,
  oauthClient,
  paste,
  pasteStar,
  pasteViewDay,
  user,
} from "@workspace/db/schema"
import { hashPassword } from "better-auth/crypto"
import { eq, sql } from "drizzle-orm"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { insertPaste } from "@/lib/pastes/insert"
import { DAY, HOUR, MINUTE } from "@/lib/time"
import { DEMO_EMAIL, DEMO_NAME, DEMO_USER_ID, DEMO_USERNAME, demoPassword } from "./guest"
import { DEMO_COLLECTIONS, DEMO_PASTES } from "./seed"

const DEMO_LOCK = 0x5e1d_de30
// Two connected agents, so the agent widgets have something to show. Requests per day over the
// last two weeks, oldest first.
const DEMO_AGENTS = [
  {
    id: "sntc_demo_claude_code",
    name: "Claude Code",
    requests: [12, 30, 22, 0, 0, 41, 56, 38, 47, 25, 0, 63, 71, 34],
  },
  {
    id: "sntc_demo_codex",
    name: "Codex",
    requests: [0, 8, 14, 0, 0, 9, 0, 17, 21, 6, 0, 12, 18, 9],
  },
] as const
// The views chart shows this many days at most.
const HISTORY_DAYS = 30
const globalJobs = globalThis as typeof globalThis & {
  __sniptideDemoTimer?: ReturnType<typeof setInterval>
}

// How often the guest account goes back to the example data (DEMO_RESET_MINUTES, hourly).
export function demoResetMinutes() {
  return envInteger("DEMO_RESET_MINUTES", 60, 5, 1440)
}

// Views per day for the charts, spread over the days since the paste was made. Deterministic, so
// every reset draws the same shape.
export function viewHistory(slug: string, views: number, ageDays: number) {
  const days = Math.max(1, Math.min(HISTORY_DAYS, Math.ceil(ageDays)))
  const seed = [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const weights = Array.from({ length: days }, (_, day) => 0.4 + ((seed + day * 7) % 10) / 10)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight) => Math.round((views * weight) / total))
}

// Puts the guest account back to the example data: the account itself and its sessions stay (so
// visitors aren't signed out), everything it owns is replaced. Returns false when another
// replica is already doing it.
export async function resetDemo(db: Database, secret: string, now = new Date()) {
  const passwordHash = await hashPassword(demoPassword(secret))

  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(${DEMO_LOCK}) AS locked`,
    )
    if (!lock?.locked) return false

    const profile = {
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      emailVerified: true,
      image: null,
      username: DEMO_USERNAME,
      displayUsername: DEMO_USERNAME,
      preferences: null,
    }
    await tx
      .insert(user)
      .values({ id: DEMO_USER_ID, ...profile })
      .onConflictDoUpdate({ target: user.id, set: profile })
    await tx
      .insert(account)
      .values({
        id: `${DEMO_USER_ID}-credential`,
        accountId: DEMO_USER_ID,
        providerId: "credential",
        userId: DEMO_USER_ID,
        password: passwordHash,
      })
      .onConflictDoUpdate({ target: account.id, set: { password: passwordHash } })

    // Pastes take their files, revisions, stars, shares and view history with them.
    await tx.delete(notification).where(eq(notification.userId, DEMO_USER_ID))
    await tx.delete(paste).where(eq(paste.ownerId, DEMO_USER_ID))
    await tx.delete(pasteStar).where(eq(pasteStar.userId, DEMO_USER_ID))
    await tx.delete(collection).where(eq(collection.ownerId, DEMO_USER_ID))
    await tx.delete(apiToken).where(eq(apiToken.ownerId, DEMO_USER_ID))
    await tx.delete(apiTokenUsageDay).where(eq(apiTokenUsageDay.ownerId, DEMO_USER_ID))
    await tx.delete(envGroup).where(eq(envGroup.ownerId, DEMO_USER_ID))

    await tx.insert(collection).values(
      DEMO_COLLECTIONS.map((entry, index) => ({
        ownerId: DEMO_USER_ID,
        ...entry,
        createdAt: new Date(now.getTime() - (40 - index) * DAY),
      })),
    )

    const today = Math.floor(now.getTime() / DAY)
    for (const example of DEMO_PASTES) {
      const id = randomUUID()
      const createdAt = new Date(now.getTime() - example.ageHours * HOUR)
      const bytes = example.files.reduce(
        (sum, file) => sum + new TextEncoder().encode(file.content).byteLength,
        0,
      )
      await insertPaste(tx, {
        id,
        slug: example.slug,
        ownerId: DEMO_USER_ID,
        title: example.title,
        description: example.description,
        bytes,
        visibility: example.visibility,
        collection: example.collection,
        tags: example.tags,
        expiresAt: example.expiresInDays
          ? new Date(now.getTime() + example.expiresInDays * DAY)
          : null,
        files: example.files,
        createdAt,
        ...(example.agent ? { createdVia: "mcp" as const, createdByAgent: example.agent } : {}),
      })
      await tx
        .update(paste)
        .set({ views: example.views, uniqueViews: example.uniqueViews })
        .where(eq(paste.id, id))

      const history = viewHistory(example.slug, example.views, example.ageHours / 24)
      await tx
        .insert(pasteViewDay)
        .values(
          history
            .map((views, age) => ({ pasteId: id, day: today - age, views }))
            .filter((row) => row.views > 0),
        )
      if (example.starred) await tx.insert(pasteStar).values({ userId: DEMO_USER_ID, pasteId: id })
    }

    for (const [index, agent] of DEMO_AGENTS.entries()) {
      await tx
        .insert(oauthClient)
        .values({ id: agent.id, name: agent.name, redirectUris: ["http://127.0.0.1/callback"] })
        .onConflictDoNothing()
      // A random hash nobody holds the token for, so the grant shows up but can't be used.
      const [token] = await tx
        .insert(apiToken)
        .values({
          ownerId: DEMO_USER_ID,
          name: agent.name,
          prefix: "snpt_demo",
          hash: randomBytes(32).toString("hex"),
          scopes: ["read", "write"],
          clientId: agent.id,
          createdAt: new Date(now.getTime() - 20 * DAY),
          lastUsedAt: new Date(now.getTime() - (index * 90 + 12) * MINUTE),
        })
        .returning({ id: apiToken.id })
      if (!token) continue
      await tx.insert(apiTokenUsageDay).values(
        agent.requests
          .map((requests, offset) => ({
            ownerId: DEMO_USER_ID,
            tokenId: token.id,
            day: today - (agent.requests.length - 1 - offset),
            requests,
          }))
          .filter((row) => row.requests > 0),
      )
    }
    return true
  })
}

// Seeds the guest account now and again every DEMO_RESET_MINUTES, for as long as the server runs.
export function scheduleDemoReset() {
  const { authSecret } = getConfig()
  if (!authSecret) throw new Error("BETTER_AUTH_SECRET is not set")
  if (globalJobs.__sniptideDemoTimer) return

  const run = async () => {
    try {
      const reset = await resetDemo(getDb(), authSecret)
      console.info(JSON.stringify({ event: "demo_reset", reset }))
    } catch (error) {
      console.error("Demo reset failed", error)
    }
  }
  void run()
  globalJobs.__sniptideDemoTimer = setInterval(run, demoResetMinutes() * 60_000)
  globalJobs.__sniptideDemoTimer.unref()
}
