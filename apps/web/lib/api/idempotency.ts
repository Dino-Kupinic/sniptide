import "server-only"

import { createHash } from "node:crypto"
import type { Database } from "@workspace/db"
import { apiReceipt } from "@workspace/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"
import { ApiError } from "./http"

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export interface CreateReceipt {
  tokenId: string
  key: string
  route: string
  body: unknown
}

export function parseIdempotencyKey(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!/^[\x21-\x7e]{1,128}$/.test(value))
    throw new ApiError(400, "Idempotency-Key must contain 1 to 128 visible ASCII characters.")
  return value
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  )
}

export async function createWithReceipt<T>(
  receipt: CreateReceipt | undefined,
  create: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    if (!receipt) return create(tx)
    const fingerprint = createHash("sha256")
      .update(canonical([receipt.route, receipt.body]))
      .digest("hex")
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${receipt.tokenId}:${receipt.key}`}, 0))`,
    )
    const condition = and(eq(apiReceipt.tokenId, receipt.tokenId), eq(apiReceipt.key, receipt.key))
    const [saved] = await tx.select().from(apiReceipt).where(condition)
    if (saved && saved.expiresAt.getTime() > Date.now()) {
      if (saved.fingerprint !== fingerprint)
        throw new ApiError(409, "This Idempotency-Key was used for another route or payload.")
      return saved.response as T
    }
    if (saved) await tx.delete(apiReceipt).where(condition)
    const response = await create(tx)
    await tx.insert(apiReceipt).values({
      tokenId: receipt.tokenId,
      key: receipt.key,
      fingerprint,
      response,
      expiresAt: new Date(Date.now() + DAY),
    })
    return response
  })
}
