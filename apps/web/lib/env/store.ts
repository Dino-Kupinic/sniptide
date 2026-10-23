import "server-only"

import { envGroup, envVariable, user } from "@workspace/db/schema"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { decryptValue, encryptValue } from "./crypto"

// Env groups (packages/db/src/schema/env.ts): named sets of environment variables that
// `sniptide env push` uploads from a .env file and `env pull` / `env run` bring back. Each group
// belongs to one account and is only reached through that account's session or API tokens.

export {
  GROUP_SLUG,
  groupSlugSchema,
  MAX_GROUP_BYTES,
  MAX_GROUPS,
  MAX_VALUE_BYTES,
  MAX_VARIABLES,
  type Variable,
  variablesSchema,
} from "./inputs"

import { groupSlugSchema, MAX_GROUPS, type Variable, variablesSchema } from "./inputs"

export interface EnvGroupSummary {
  slug: string
  variables: number
  createdAt: number
  updatedAt: number
}

export interface EnvGroup {
  slug: string
  updatedAt: number
  variables: Variable[]
}

const context = (groupId: string, name: string) => `${groupId}:${name}`

export async function listGroups(owner: string): Promise<EnvGroupSummary[]> {
  const rows = await getDb()
    .select({
      slug: envGroup.slug,
      createdAt: envGroup.createdAt,
      updatedAt: envGroup.updatedAt,
      variables: sql<number>`(select count(*)::int from ${envVariable} where ${envVariable.groupId} = ${envGroup.id})`,
    })
    .from(envGroup)
    .where(eq(envGroup.ownerId, owner))
    .orderBy(desc(envGroup.updatedAt), asc(envGroup.slug))
  return rows.map((row) => ({
    slug: row.slug,
    variables: row.variables,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }))
}

// A group with its values decrypted, or null when the owner has none by that name.
export async function readGroup(owner: string, slug: string): Promise<EnvGroup | null> {
  const db = getDb()
  const [group] = await db
    .select()
    .from(envGroup)
    .where(and(eq(envGroup.ownerId, owner), eq(envGroup.slug, slug)))
  if (!group) return null
  const rows = await db
    .select()
    .from(envVariable)
    .where(eq(envVariable.groupId, group.id))
    .orderBy(asc(envVariable.position))
  return {
    slug: group.slug,
    updatedAt: group.updatedAt.getTime(),
    variables: rows.map((row) => ({
      name: row.name,
      value: decryptValue(row.value, context(group.id, row.name)),
    })),
  }
}

export type WriteResult = { status: "ok"; group: EnvGroup } | { status: "limit" }

// Replaces a group's variables with `variables`, creating the group if it's new. A push is the
// whole .env file, so anything left out of it is removed.
export async function writeGroup(
  owner: string,
  slug: string,
  input: unknown,
): Promise<WriteResult> {
  const name = groupSlugSchema.parse(slug)
  const variables = variablesSchema.parse(input)
  const now = new Date()
  return getDb().transaction(async (tx) => {
    // Serializes group creation per account, so the group limit holds under concurrent pushes.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, owner)).for("update")
    let [group] = await tx
      .select()
      .from(envGroup)
      .where(and(eq(envGroup.ownerId, owner), eq(envGroup.slug, name)))
      .for("update")
    if (!group) {
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(envGroup)
        .where(eq(envGroup.ownerId, owner))
      if ((count?.count ?? 0) >= MAX_GROUPS) return { status: "limit" as const }
      ;[group] = await tx
        .insert(envGroup)
        .values({ ownerId: owner, slug: name, createdAt: now, updatedAt: now })
        .returning()
    } else {
      await tx
        .update(envGroup)
        .set({ updatedAt: now, revision: sql`${envGroup.revision} + 1` })
        .where(eq(envGroup.id, group.id))
    }
    if (!group) throw new Error("Couldn't create the env group.")
    const id = group.id
    await tx.delete(envVariable).where(eq(envVariable.groupId, id))
    if (variables.length)
      await tx.insert(envVariable).values(
        variables.map((variable, position) => ({
          groupId: id,
          position,
          name: variable.name,
          value: encryptValue(variable.value, context(id, variable.name)),
        })),
      )
    return { status: "ok" as const, group: { slug: name, updatedAt: now.getTime(), variables } }
  })
}

export async function deleteGroup(owner: string, slug: string) {
  const rows = await getDb()
    .delete(envGroup)
    .where(and(eq(envGroup.ownerId, owner), eq(envGroup.slug, slug)))
    .returning({ id: envGroup.id })
  return rows.length > 0
}
