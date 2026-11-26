import "server-only"

import { accountUsage, apiTokenUsageDay, user } from "@workspace/db/schema"
import { desc, eq, gte, sql } from "drizzle-orm"
import { getConfig } from "./config"
import { getDb } from "./db"

const DAY = 24 * 60 * 60 * 1000

// A token may make 3,600 requests an hour (apps/web/lib/api/tokens.ts), so one token's busiest day
// is measured against 24 times that.
export const TOKEN_DAILY_CEILING = 3600 * 24
// An account counts as close to a limit from this share of it.
export const NEAR_LIMIT = 0.8
// Days of API usage the page looks back over.
const API_WINDOW_DAYS = 7

// "share" orders by each account's highest share of any limit, so the accounts closest to one
// come first. It is the default and has no column of its own.
export type AccountSort = "share" | "storage" | "pastes" | "api"
export const SORTS: AccountSort[] = ["share", "storage", "pastes", "api"]

export interface AccountRow {
  id: string
  name: string
  email: string
  createdAt: Date
  storageBytes: number
  pasteCount: number
  // The busiest single token-day in the window.
  apiPeakDay: number
  // Each figure as a share of its limit, or null when the limit is off.
  shares: { storage: number | null; pastes: number | null; api: number }
}

export interface Limits {
  bytes: number | null
  pastes: number | null
}

export function sharesOf(
  row: Pick<AccountRow, "storageBytes" | "pasteCount" | "apiPeakDay">,
  limits: Limits,
) {
  return {
    storage: limits.bytes === null ? null : row.storageBytes / limits.bytes,
    pastes: limits.pastes === null ? null : row.pasteCount / limits.pastes,
    api: row.apiPeakDay / TOKEN_DAILY_CEILING,
  }
}

// The highest share among an account's limits.
export function highestShare(shares: AccountRow["shares"]) {
  return Math.max(shares.storage ?? 0, shares.pastes ?? 0, shares.api)
}

export function sortAccounts(rows: AccountRow[], sort: AccountSort, direction: "asc" | "desc") {
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const shareOf = (r: AccountRow) => (sort === "share" ? highestShare(r.shares) : r.shares[sort])
    const difference = (shareOf(a) ?? 0) - (shareOf(b) ?? 0)
    if (difference) return sign * difference
    const raw =
      sort === "share" || sort === "storage"
        ? a.storageBytes - b.storageBytes
        : sort === "pastes"
          ? a.pasteCount - b.pasteCount
          : a.apiPeakDay - b.apiPeakDay
    return sign * raw || a.id.localeCompare(b.id)
  })
}

// Every account with its usage, read from the app's reconciled counters (account_usage) and its
// daily token meter (api_token_usage_day). Only metadata: no paste is read.
export async function listAccountUsage(now = new Date()): Promise<AccountRow[]> {
  const db = getDb()
  const limits = getConfig().limits
  const since = Math.floor(now.getTime() / DAY) - API_WINDOW_DAYS + 1
  const api = db
    .select({
      ownerId: apiTokenUsageDay.ownerId,
      peak: sql<number>`max(${apiTokenUsageDay.requests})::float8`.as("peak"),
    })
    .from(apiTokenUsageDay)
    .where(gte(apiTokenUsageDay.day, since))
    .groupBy(apiTokenUsageDay.ownerId)
    .as("api")
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      storageBytes: sql<number>`coalesce(${accountUsage.storageBytes}, 0)::float8`,
      pasteCount: sql<number>`coalesce(${accountUsage.pasteCount}, 0)::float8`,
      apiPeakDay: sql<number>`coalesce(${api.peak}, 0)::float8`,
    })
    .from(user)
    .leftJoin(accountUsage, eq(accountUsage.ownerId, user.id))
    .leftJoin(api, eq(api.ownerId, user.id))
    .orderBy(desc(user.createdAt))
  return rows.map((row) => ({ ...row, shares: sharesOf(row, limits) }))
}

export function nearLimit(rows: AccountRow[]) {
  return rows.filter((row) => highestShare(row.shares) >= NEAR_LIMIT)
}
