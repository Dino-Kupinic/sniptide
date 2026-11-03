import { failure, json, readJson, withToken } from "@/lib/api/http"
import { deleteGroup, GROUP_SLUG, MAX_GROUPS, readGroup, writeGroup } from "@/lib/env/store"

export const dynamic = "force-dynamic"

// One env group. GET returns its variables (`sniptide env pull` and `env run`), PUT replaces them
// with a .env file's (`env push`), DELETE removes the group. A PUT that sends `revision` is
// refused with 412 once the group has changed since that revision.

type Context = RouteContext<"/api/v1/env/[group]">

function present(group: { slug: string; updatedAt: number; revision: number; variables: unknown }) {
  return { ...group, updatedAt: new Date(group.updatedAt).toISOString() }
}

export async function GET(request: Request, { params }: Context) {
  const { group: slug } = await params
  return withToken(request, "read", async ({ userId }) => {
    const group = GROUP_SLUG.test(slug) ? await readGroup(userId, slug) : null
    return group ? json({ group: present(group) }) : failure(404, "No env group with that name.")
  })
}

export async function PUT(request: Request, { params }: Context) {
  const { group: slug } = await params
  return withToken(request, "write", async ({ userId }) => {
    const body = (await readJson(request, 1024 * 1024)) as {
      variables?: unknown
      revision?: unknown
    } | null
    const revision = body?.revision
    if (
      revision !== undefined &&
      (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0)
    )
      return failure(400, "revision must be a whole number from 0.")
    const result = await writeGroup(userId, slug, body?.variables, revision)
    if (result.status === "limit")
      return failure(409, `You can have up to ${MAX_GROUPS} env groups. Delete one first.`)
    if (result.status === "conflict")
      return failure(
        412,
        `The env group changed since revision ${revision}. Pull it again, or push without a revision to replace it.`,
      )
    return json({ group: present(result.group) })
  })
}

export async function DELETE(request: Request, { params }: Context) {
  const { group: slug } = await params
  return withToken(request, "write", async ({ userId }) => {
    const deleted = GROUP_SLUG.test(slug) && (await deleteGroup(userId, slug))
    return deleted ? json({ ok: true }) : failure(404, "No env group with that name.")
  })
}
