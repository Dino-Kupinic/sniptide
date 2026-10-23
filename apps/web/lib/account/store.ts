import "server-only"

import { account, session } from "@workspace/db/schema"
import { and, desc, eq, gt } from "drizzle-orm"
import { getDb } from "@/lib/db"

export type LinkedProvider = "github" | "google"

export interface SessionSummary {
  id: string
  current: boolean
  browser: string | null
  os: string | null
  ipAddress: string | null
  createdAt: number
  lastActiveAt: number
}

export interface AccountSecurity {
  hasPassword: boolean
  linked: { provider: LinkedProvider; linkedAt: number }[]
  sessions: SessionSummary[]
}

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
  [/curl\//, "curl"],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
]

// Enough of the user agent to tell devices apart in a list. Order matters: Edge and Opera also
// say Chrome, Chrome also says Safari, and Android also says Linux.
export function describeUserAgent(userAgent: string | null) {
  if (!userAgent) return { browser: null, os: null }
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null,
    os: SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null,
  }
}

// What the Account tab shows: sign-in methods and live sessions. Session tokens stay on the
// server; the page only gets ids.
export async function readAccountSecurity(
  userId: string,
  currentSessionId: string,
): Promise<AccountSecurity> {
  const db = getDb()
  const [accounts, sessions] = await Promise.all([
    db
      .select({
        providerId: account.providerId,
        password: account.password,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, userId)),
    db
      .select({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
      .from(session)
      .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt))
      .limit(50),
  ])

  return {
    hasPassword: accounts.some((row) => row.providerId === "credential" && Boolean(row.password)),
    linked: accounts.flatMap((row) =>
      row.providerId === "github" || row.providerId === "google"
        ? [{ provider: row.providerId, linkedAt: row.createdAt.getTime() }]
        : [],
    ),
    sessions: sessions
      .map((row) => ({
        id: row.id,
        current: row.id === currentSessionId,
        ...describeUserAgent(row.userAgent),
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.getTime(),
        lastActiveAt: row.updatedAt.getTime(),
      }))
      // The session in use comes first.
      .sort((a, b) => Number(b.current) - Number(a.current)),
  }
}

// The token Better Auth needs to revoke a session, looked up by id within the user's own sessions.
export async function sessionToken(userId: string, sessionId: string) {
  const [row] = await getDb()
    .select({ token: session.token })
    .from(session)
    .where(and(eq(session.userId, userId), eq(session.id, sessionId)))
  return row?.token ?? null
}

export async function hasPassword(userId: string) {
  const [row] = await getDb()
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
  return Boolean(row?.password)
}

// Better Auth unlinks by its own account row id, not by provider.
export async function linkedAccountId(userId: string, providerId: LinkedProvider) {
  const [row] = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
  return row?.id ?? null
}
