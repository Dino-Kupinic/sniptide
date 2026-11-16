import "server-only"

import type { Database } from "@workspace/db"
import { apiToken, type EnvAuditDetail, envAudit, oauthClient, user } from "@workspace/db/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { initials } from "@/lib/format"
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
      actorId: envAudit.actorId,
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
  const page = rows.slice(0, limit)
  const people = await findPeople(
    page.flatMap((row) => [row.actorId, row.detail.personId].filter((id) => id != null)),
  )
  return {
    entries: page.map(({ actorId, actor, ...row }) => ({
      ...row,
      createdAt: row.createdAt.getTime(),
      actor: person(people, actorId, actor),
      person: person(people, row.detail.personId, row.detail.person ?? null),
    })),
    more: rows.length > limit,
  }
}

export interface AuditPerson {
  id: string
  name: string
  handle: string
  initials: string
}

// The people an entry names, with their current display names. Someone whose account is gone
// keeps the handle the entry recorded.
async function findPeople(ids: string[]) {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map<string, AuditPerson>()
  const rows = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      displayUsername: user.displayUsername,
    })
    .from(user)
    .where(inArray(user.id, unique))
  return new Map(
    rows.map((row) => {
      const username = row.displayUsername ?? row.username
      const handle = username ? `@${username}` : row.email
      const name = row.name.trim() || handle
      return [row.id, { id: row.id, name, handle, initials: initials(name) }]
    }),
  )
}

function person(
  people: Map<string, AuditPerson>,
  id: string | null | undefined,
  handle: string | null,
): AuditPerson | null {
  const found = id ? people.get(id) : undefined
  if (found) return found
  if (!handle) return null
  return { id: id ?? handle, name: handle, handle, initials: initials(handle.replace(/^@/, "")) }
}
export type AuditEntry = Awaited<ReturnType<typeof listAudit>>["entries"][number]
