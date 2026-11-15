import "server-only"

import { apiToken, apiTokenUsageDay, paste, rateLimit } from "@workspace/db/schema"
import { inArray, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { type Hit, hit, type Limit, settle } from "@/lib/rate-limit"
import { runMaintenanceWork } from "@/lib/request-admission"
import { DAY } from "@/lib/time"
import { tokenRequestLimit } from "./tokens"

// What a token request counts: the token's rate limit, the account's daily usage, the token's
// last-used time and reads of a paste. A request counts in memory and returns; the totals are
// written together once a second. A read of a paste therefore commits nothing, where it used to
// commit the usage and rate-limit counters and then the read count.
//
// The cost is precision. A process learns what other processes counted against a token when it
// writes its own counts, so a token can pass its limit by what the other processes admit in that
// second. A process that stops without flushing loses up to a second of counts.

const FLUSH_INTERVAL_MS = 1000
// Past this many distinct keys the meter flushes at once, so a burst can't grow it without bound.
const MAX_PENDING_KEYS = 20_000

interface Window {
  // Hits the database held when this process last wrote to it, and hits counted here since.
  stored: number
  pending: number
  resetsAt: number
}
interface MeterState {
  windows: Map<string, Window>
  usage: Map<string, { ownerId: string; tokenId: string; day: number; requests: number }>
  reads: Map<string, number>
  used: Set<string>
  opening: Map<string, Promise<Hit>>
  timer: ReturnType<typeof setInterval> | null
  flushing: Promise<void> | null
}
const globalMeter = globalThis as typeof globalThis & { __sniptideMeter?: MeterState }
globalMeter.__sniptideMeter ??= {
  windows: new Map(),
  usage: new Map(),
  reads: new Map(),
  used: new Set(),
  opening: new Map(),
  timer: null,
  flushing: null,
}
const meter = globalMeter.__sniptideMeter

function schedule() {
  // Tests flush by hand, so a timer never writes into a database another test has reset.
  if (meter.timer || process.env.NODE_ENV === "test") return
  meter.timer = setInterval(() => void flushMeter(), FLUSH_INTERVAL_MS)
  meter.timer.unref()
}

function pendingKeys() {
  return meter.windows.size + meter.usage.size + meter.reads.size + meter.used.size
}

// Counts one request with a token and says whether the token is within its rate limit. The
// first request of a window asks the database, which holds what every process has counted.
export async function meterRequest(
  owner: { userId: string; tokenId: string },
  now = new Date(),
): Promise<Hit> {
  const limit = tokenRequestLimit(owner.tokenId)
  const day = Math.floor(now.getTime() / DAY)
  const usageKey = `${owner.tokenId}:${day}`
  const usage = meter.usage.get(usageKey)
  if (usage) usage.requests++
  else
    meter.usage.set(usageKey, {
      ownerId: owner.userId,
      tokenId: owner.tokenId,
      day,
      requests: 1,
    })
  schedule()

  let window = meter.windows.get(limit.key)
  if (window && now.getTime() >= window.resetsAt) {
    meter.windows.delete(limit.key)
    window = undefined
  }
  if (!window) {
    // Requests that arrive while the first one asks the database wait for its answer and then
    // count here, so a burst on a new token costs one statement.
    const opening = meter.opening.get(limit.key)
    if (opening) {
      await opening.catch(() => {})
      return meterWindow(limit, now)
    }
    const asked = hit([limit])
    meter.opening.set(limit.key, asked)
    try {
      const counted = await asked
      const [quota] = counted.quotas
      meter.windows.set(limit.key, {
        // A refused first hit is over the limit by an unknown amount; one over is enough.
        stored: counted.allowed ? limit.max - (quota?.remaining ?? 0) : limit.max + 1,
        pending: 0,
        resetsAt: now.getTime() + (quota?.resetSeconds ?? Number(limit.windowSeconds)) * 1000,
      })
      return counted
    } finally {
      meter.opening.delete(limit.key)
    }
  }
  return meterWindow(limit, now)
}

async function meterWindow(limit: Limit, now: Date): Promise<Hit> {
  const window = meter.windows.get(limit.key)
  // The first request failed to open the window, so this one asks the database itself.
  if (!window) return hit([limit])
  window.pending++
  if (pendingKeys() > MAX_PENDING_KEYS) void flushMeter()
  return settle([
    {
      limit,
      count: window.stored + window.pending,
      left: Math.ceil((window.resetsAt - now.getTime()) / 1000),
    },
  ])
}

// Counts a read with a token on each paste, for "Read N times through MCP or the CLI" on the
// paste page. Only reads the caller asked for count: never search results or the read-back after
// a write. The count changes no version or edit time, so open editors see no conflict.
export function meterReads(ids: string[]) {
  for (const id of new Set(ids)) meter.reads.set(id, (meter.reads.get(id) ?? 0) + 1)
  if (ids.length) schedule()
}

// Marks a token as used, for the last-used time in Settings.
export function meterTokenUse(tokenId: string) {
  meter.used.add(tokenId)
  schedule()
}

async function write() {
  const windows = [...meter.windows.entries()].filter(([, window]) => window.pending > 0)
  const sent = windows.map(([key, window]) => ({ key, hits: window.pending, window }))
  const usage = [...meter.usage.values()]
  const reads = [...meter.reads.entries()].map(([id, count]) => ({ id, count }))
  const used = [...meter.used]
  meter.usage = new Map()
  meter.reads = new Map()
  meter.used = new Set()
  for (const { window, hits } of sent) window.pending -= hits
  if (!sent.length && !usage.length && !reads.length && !used.length) return
  const now = Date.now()
  try {
    await runMaintenanceWork(() =>
      getDb().transaction(async (tx) => {
        if (sent.length) {
          const seconds = Number(tokenRequestLimit("").windowSeconds)
          const fresh = sql`rate_limit.window_start <= now() - make_interval(secs => ${seconds}::int)`
          const rows = await tx.execute<{ key: string; count: number; left: number }>(sql`
            insert into ${rateLimit} (key, count)
            select key, hits from json_to_recordset(${JSON.stringify(
              sent.map(({ key, hits }) => ({ key, hits })),
            )}::text::json) as counted(key text, hits int)
            on conflict (key) do update set
              count = case when ${fresh} then excluded.count else rate_limit.count + excluded.count end,
              window_start = case when ${fresh} then now() else rate_limit.window_start end
            returning key, count,
              ceil(extract(epoch from (window_start + make_interval(secs => ${seconds}::int) - now())))::int as left`)
          for (const row of rows) {
            const window = meter.windows.get(row.key)
            if (!window) continue
            window.stored = row.count
            window.resetsAt = now + Math.max(1, row.left) * 1000
          }
        }
        if (usage.length)
          // An account deleted since the request leaves nothing to count against.
          await tx.execute(sql`
            insert into ${apiTokenUsageDay} (owner_id, token_id, day, requests)
            select counted.owner_id, counted.token_id::uuid, counted.day, counted.requests
            from json_to_recordset(${JSON.stringify(
              usage.map((row) => ({
                owner_id: row.ownerId,
                token_id: row.tokenId,
                day: row.day,
                requests: row.requests,
              })),
            )}::text::json) as counted(owner_id text, token_id text, day int, requests bigint)
            where exists (select 1 from "user" where id = counted.owner_id)
            on conflict (owner_id, day, token_id)
            do update set requests = api_token_usage_day.requests + excluded.requests`)
        if (reads.length)
          await tx.execute(sql`
            update ${paste} set agent_reads = agent_reads + counted.count
            from json_to_recordset(${JSON.stringify(reads)}::text::json) as counted(id uuid, count int)
            where paste.id = counted.id`)
        if (used.length)
          await tx
            .update(apiToken)
            .set({ lastUsedAt: new Date(now) })
            .where(inArray(apiToken.id, used))
      }),
    )
  } catch {
    // Nothing is lost on a failed write: the counts go back and the next flush sends them.
    for (const { window, hits } of sent) window.pending += hits
    for (const row of usage) {
      const key = `${row.tokenId}:${row.day}`
      const kept = meter.usage.get(key)
      if (kept) kept.requests += row.requests
      else meter.usage.set(key, row)
    }
    for (const { id, count } of reads) meter.reads.set(id, (meter.reads.get(id) ?? 0) + count)
    for (const id of used) meter.used.add(id)
    // The driver's message can carry statement parameters, so only the event is logged.
    console.error(JSON.stringify({ event: "meter_flush_failed" }))
  }
  // Windows that ended hold nothing more to write.
  for (const [key, window] of meter.windows)
    if (window.pending === 0 && now >= window.resetsAt) meter.windows.delete(key)
}

// Writes what has been counted. Calls made while a write runs wait for it and then write again,
// so a caller that awaits this has its own counts in the database.
export async function flushMeter() {
  while (meter.flushing) await meter.flushing
  meter.flushing = write().finally(() => {
    meter.flushing = null
  })
  await meter.flushing
}

// Forgets everything counted and every window, so the next request asks the database again.
export function resetMeter() {
  meter.windows.clear()
  meter.usage.clear()
  meter.reads.clear()
  meter.used.clear()
}
