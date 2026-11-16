import "server-only"

import type { Database } from "@workspace/db"
import { apiToken, type EnvAuditDetail, envAudit, oauthClient, user } from "@workspace/db/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getDb } from "@/lib/db"
import type { AuditFilter } from "./inputs"

// The audit log of secret groups (env_audit): who read, revealed and edited values, and who
// changed access. An entry is written in the same transaction as the change it describes, and
// before a value is returned, so nothing leaves the server without one.

type AuditAction = (typeof envAudit.$inferSelect)["action"]

// How a request reached a group: the app, an API token or OAuth-connected agent, or a protected
// link, which needs no account.
export type AuditSource =
  | { via: "web"; userId: string }
  | { via: "token"; userId: string; tokenId: string }
  | { via: "link" }

type Writer = Pick<Database, "insert" | "select">

// What an entry calls an account: its @username, or its email when it has none.
export async function accountHandle(db: Pick<Database, "select">, userId: string) {
  const [row] = await db
    .select({
      username: user.username,
      displayUsername: user.displayUsername,
      email: user.email,
    })
    .from(user)
    .where(eq(user.id, userId))
  if (!row) return null
  const username = row.displayUsername ?? row.username
  return username ? `@${username}` : row.email
}

export async function recordAudit(
  db: Writer,
  group: { id: string; slug: string; ownerId: string },
  action: AuditAction,
  source: AuditSource,
  detail: EnvAuditDetail = {},
) {
  let token: string | undefined
  if (source.via === "token") {
    const [row] = await db
      .select({ name: apiToken.name, client: oauthClient.name })
      .from(apiToken)
      .leftJoin(oauthClient, eq(apiToken.clientId, oauthClient.id))
      .where(eq(apiToken.id, source.tokenId))
    token = row?.client ?? row?.name
  }
  await db.insert(envAudit).values({
    ownerId: group.ownerId,
    groupId: group.id,
    groupSlug: group.slug,
    action,
    via: source.via,
    actorId: source.via === "link" ? null : source.userId,
    actor: source.via === "link" ? null : await accountHandle(db, source.userId),
    detail: token ? { ...detail, token } : detail,
  })
}

const filters: Record<Exclude<AuditFilter, "all">, AuditAction[]> = {
  reads: ["read", "reveal"],
  changes: ["create", "edit", "delete"],
  access: ["link_create", "link_revoke", "grant", "revoke", "leave"],
}

const AUDIT_PAGE_SIZE = 50

// The newest entries of the groups an account owns, including groups it has since deleted.
// `more` says whether an older page exists.
export async function listAudit(
  owner: string,
  options: { groupId?: string; filter?: AuditFilter; page?: number; limit?: number } = {},
) {
  const limit = options.limit ?? AUDIT_PAGE_SIZE
  const filter = options.filter ?? "all"
  const rows = await getDb()
    .select({
      id: envAudit.id,
      groupId: envAudit.groupId,
      groupSlug: envAudit.groupSlug,
      action: envAudit.action,
      via: envAudit.via,
      actor: envAudit.actor,
      detail: envAudit.detail,
      createdAt: envAudit.createdAt,
    })
    .from(envAudit)
    .where(
      and(
        eq(envAudit.ownerId, owner),
        options.groupId ? eq(envAudit.groupId, options.groupId) : undefined,
        filter === "all" ? undefined : inArray(envAudit.action, filters[filter]),
      ),
    )
    .orderBy(desc(envAudit.createdAt), desc(envAudit.id))
    .limit(limit + 1)
    .offset((options.page ?? 0) * limit)
  return {
    entries: rows.slice(0, limit).map((row) => ({ ...row, createdAt: row.createdAt.getTime() })),
    more: rows.length > limit,
  }
}
export type AuditEntry = Awaited<ReturnType<typeof listAudit>>["entries"][number]
