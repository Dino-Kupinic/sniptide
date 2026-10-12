import "server-only"

import { createHmac, randomBytes } from "node:crypto"
import { analyticsSalt, pasteEvent } from "@workspace/db/schema"
import { and, eq, gt } from "drizzle-orm"
import { headers as requestHeaders } from "next/headers"
import { clientAddress } from "@/lib/client-ip"
import { getConfig } from "@/lib/config"
import { getDb } from "@/lib/db"
import { DAY, MINUTE } from "@/lib/time"
import { countryOf, deviceOf, isAutomated, isHumanVisit, referrerHost } from "./hit"

export type EventKind = (typeof pasteEvent.$inferInsert)["kind"]

// A reader who hits Copy again within this long doesn't count twice, so a button held down or a
// script can't run the number up.
const COPY_WINDOW = 10 * MINUTE

const globalSalts = globalThis as typeof globalThis & { __sniptideSalts?: Map<number, string> }

// Today's salt for hashing visitors. One row per UTC day, made by whichever instance asks first;
// each process keeps the current day's in memory. The rollup job deletes old days.
async function saltFor(day: number) {
  globalSalts.__sniptideSalts ??= new Map()
  const cache = globalSalts.__sniptideSalts
  const cached = cache.get(day)
  if (cached) return cached

  const db = getDb()
  await db
    .insert(analyticsSalt)
    .values({ day, salt: randomBytes(16).toString("hex") })
    .onConflictDoNothing()
  const [row] = await db.select().from(analyticsSalt).where(eq(analyticsSalt.day, day))
  if (!row) throw new Error("analytics salt is missing")

  cache.clear()
  cache.set(day, row.salt)
  return row.salt
}

// A stable name for "this browser at this address today" that can't be turned back into either,
// and doesn't match yesterday's. Used only to tell visitors apart within a day.
async function visitorFor(headers: Headers, now: number) {
  const salt = await saltFor(Math.floor(now / DAY))
  return createHmac("sha256", salt)
    .update(`${clientAddress(headers)}\n${headers.get("user-agent") ?? ""}`)
    .digest("hex")
    .slice(0, 32)
}

function ownHosts(headers: Headers) {
  const { shareUrl, appUrl } = getConfig()
  return [
    headers.get("x-forwarded-host"),
    headers.get("host"),
    shareUrl && new URL(shareUrl).host,
    appUrl && new URL(appUrl).host,
  ].filter((host): host is string => Boolean(host))
}

// Records one hit on a paste for the Analytics page. Called after the read has been authorized,
// and never for the paste's owner. Crawlers, previews and prefetches are dropped here (a view
// also has to come from a browser), and a failure is logged rather than thrown: analytics must
// not be able to break reading a paste.
export async function recordPasteEvent(
  pasteId: string,
  kind: EventKind,
  headers?: Headers,
  now = Date.now(),
) {
  try {
    const request = headers ?? (await requestHeaders())
    if (kind === "view" ? !isHumanVisit(request) : isAutomated(request)) return

    const visitor = await visitorFor(request, now)
    const db = getDb()
    if (kind === "copy") {
      const [recent] = await db
        .select({ id: pasteEvent.id })
        .from(pasteEvent)
        .where(
          and(
            eq(pasteEvent.pasteId, pasteId),
            eq(pasteEvent.kind, "copy"),
            eq(pasteEvent.visitor, visitor),
            gt(pasteEvent.at, new Date(now - COPY_WINDOW)),
          ),
        )
        .limit(1)
      if (recent) return
    }

    await db.insert(pasteEvent).values({
      pasteId,
      at: new Date(now),
      kind,
      visitor,
      // Where the reader came from matters for views; a raw file or a copy keeps no referrer.
      referrer: kind === "view" ? referrerHost(request.get("referer"), ownHosts(request)) : null,
      country: kind === "view" ? countryOf(request) : null,
      device: deviceOf(request),
    })
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "analytics_record_failed",
        kind,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}
