import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { apiToken } from "@workspace/db/schema"
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { DAY } from "@/lib/time"

// Personal API tokens (packages/db/src/schema/tokens.ts). A token acts for the account that made
// it, limited to its scopes: `read` lists and pulls pastes and env groups, `write` creates them.
// Only a hash is stored, so a lost token can't be shown again; it's revoked and replaced.

export const SCOPES = ["read", "write"] as const
export type Scope = (typeof SCOPES)[number]

export const TOKEN_PREFIX = "snpt_"
export const MAX_TOKENS = 25
export const TOKEN_EXPIRIES = ["30d", "90d", "1y", "never"] as const
export type TokenExpiry = (typeof TOKEN_EXPIRIES)[number]
const EXPIRY_DAYS: Record<Exclude<TokenExpiry, "never">, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
}
// last_used_at is a hint for the settings list, so it's written at most once a minute per token.
const LAST_USED_GRANULARITY_MS = 60_000

export interface TokenSummary {
  id: string
  name: string
  prefix: string
  scopes: Scope[]
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number | null
}

export interface TokenOwner {
  tokenId: string
  userId: string
  scopes: Scope[]
}

export const tokenInputSchema = z.object({
  name: z.string().trim().min(1, "Name the token.").max(60, "Use at most 60 characters."),
  // Writing without reading back what you wrote isn't useful, so write always comes with read.
  write: z.boolean(),
  expiry: z.enum(TOKEN_EXPIRIES),
})
export type TokenInput = z.input<typeof tokenInputSchema>

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function scopesOf(value: string[]): Scope[] {
  return SCOPES.filter((scope) => value.includes(scope))
}

function summary(row: typeof apiToken.$inferSelect): TokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: scopesOf(row.scopes),
    createdAt: row.createdAt.getTime(),
    lastUsedAt: row.lastUsedAt?.getTime() ?? null,
    expiresAt: row.expiresAt?.getTime() ?? null,
  }
}

export type CreateTokenResult =
  | { ok: true; token: string; summary: TokenSummary }
  | { ok: false; error: string }

// Makes a token for `owner` and returns it in full, the only time it's ever available.
export async function createToken(owner: string, input: TokenInput): Promise<CreateTokenResult> {
  const parsed = tokenInputSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the token." }
  const { name, write, expiry } = parsed.data
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  const now = Date.now()
  return getDb().transaction(async (tx) => {
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(apiToken)
      .where(eq(apiToken.ownerId, owner))
    if ((count?.count ?? 0) >= MAX_TOKENS)
      return {
        ok: false as const,
        error: `You can have up to ${MAX_TOKENS} tokens. Revoke one you no longer use.`,
      }
    const [row] = await tx
      .insert(apiToken)
      .values({
        ownerId: owner,
        name,
        prefix: token.slice(0, TOKEN_PREFIX.length + 6),
        hash: hashToken(token),
        scopes: write ? ["read", "write"] : ["read"],
        createdAt: new Date(now),
        expiresAt: expiry === "never" ? null : new Date(now + EXPIRY_DAYS[expiry] * DAY),
      })
      .returning()
    if (!row) return { ok: false as const, error: "Couldn't create the token. Try again." }
    return { ok: true as const, token, summary: summary(row) }
  })
}

// The account's tokens, oldest first. Never includes the tokens themselves.
export async function listTokens(owner: string): Promise<TokenSummary[]> {
  const rows = await getDb()
    .select()
    .from(apiToken)
    .where(eq(apiToken.ownerId, owner))
    .orderBy(asc(apiToken.createdAt), asc(apiToken.id))
  return rows.map(summary)
}

// Deleting the row is the revocation: the next request with that token gets a 401.
export async function revokeToken(owner: string, id: string) {
  if (!z.uuid().safeParse(id).success) return false
  const rows = await getDb()
    .delete(apiToken)
    .where(and(eq(apiToken.ownerId, owner), eq(apiToken.id, id)))
    .returning({ id: apiToken.id })
  return rows.length > 0
}

// The account and scopes behind a request's `Authorization: Bearer <token>`, or null for a
// missing, malformed, unknown, revoked or expired token.
export async function authenticate(request: Request): Promise<TokenOwner | null> {
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(header.trim())
  if (!match?.[1]?.startsWith(TOKEN_PREFIX)) return null
  const db = getDb()
  const [row] = await db
    .select({
      id: apiToken.id,
      ownerId: apiToken.ownerId,
      scopes: apiToken.scopes,
      expiresAt: apiToken.expiresAt,
      lastUsedAt: apiToken.lastUsedAt,
    })
    .from(apiToken)
    .where(eq(apiToken.hash, hashToken(match[1])))
  if (!row || (row.expiresAt && row.expiresAt.getTime() <= Date.now())) return null
  const now = new Date()
  const threshold = new Date(now.getTime() - LAST_USED_GRANULARITY_MS)
  if (!row.lastUsedAt || row.lastUsedAt < threshold) {
    await db
      .update(apiToken)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiToken.id, row.id),
          or(isNull(apiToken.lastUsedAt), lt(apiToken.lastUsedAt, threshold)),
        ),
      )
  }
  return { tokenId: row.id, userId: row.ownerId, scopes: scopesOf(row.scopes) }
}
