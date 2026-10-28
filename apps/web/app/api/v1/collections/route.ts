import { createApiCollection, listApiCollections } from "@/lib/api/collections"
import { json, readJson, withToken } from "@/lib/api/http"
import { parseIdempotencyKey } from "@/lib/api/idempotency"

export const dynamic = "force-dynamic"

// The token owner's collections, oldest first, with how many live pastes each holds.
export async function GET(request: Request) {
  return withToken(request, "read", async ({ userId }) => json(await listApiCollections(userId)))
}

export async function POST(request: Request) {
  return withToken(request, "write", async ({ userId, tokenId }) => {
    const body = await readJson(request, 4 * 1024)
    const key = parseIdempotencyKey(request.headers.get("idempotency-key"))
    return json(
      await createApiCollection(
        userId,
        body,
        key ? { tokenId, key, route: "/api/v1/collections", body } : undefined,
      ),
      201,
    )
  })
}
