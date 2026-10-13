import { json, withToken } from "@/lib/api/http"
import { listGroups } from "@/lib/env/store"

// The token owner's env groups, without their values. `sniptide env list`.
export async function GET(request: Request) {
  return withToken(request, "read", async ({ userId }) => {
    const groups = await listGroups(userId)
    return json({
      groups: groups.map((group) => ({
        slug: group.slug,
        variables: group.variables,
        createdAt: new Date(group.createdAt).toISOString(),
        updatedAt: new Date(group.updatedAt).toISOString(),
      })),
    })
  })
}
