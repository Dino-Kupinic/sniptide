import { json, readJson, withToken } from "@/lib/api/http"
import { parseIdempotencyKey } from "@/lib/api/idempotency"
import { createCapture, listCaptures, parseListQuery } from "@/lib/api/pastes"

export const dynamic = "force-dynamic"

// The token owner's pastes: GET lists and searches them, POST captures new code.
export async function GET(request: Request) {
  return withToken(request, "read", async ({ userId }) => {
    const query = parseListQuery(new URL(request.url).searchParams)
    return json(await listCaptures(userId, query))
  })
}

export async function POST(request: Request) {
  return withToken(request, "write", async ({ userId, tokenId }) => {
    // Room for a full-size paste plus its JSON escaping and metadata.
    const body = await readJson(request, 8 * 1024 * 1024)
    const key = parseIdempotencyKey(request.headers.get("idempotency-key"))
    return json(
      {
        paste: await createCapture(
          userId,
          body,
          key ? { tokenId, key, route: "/api/v1/pastes", body } : undefined,
        ),
      },
      201,
    )
  })
}
