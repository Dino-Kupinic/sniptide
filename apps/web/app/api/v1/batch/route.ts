import { ZodError, z } from "zod"
import { createApiCollection } from "@/lib/api/collections"
import { errorBody } from "@/lib/api/errors"
import { ApiError, apiLimits, json, readJson, withToken } from "@/lib/api/http"
import { parseIdempotencyKey } from "@/lib/api/idempotency"
import { createCapture } from "@/lib/api/pastes"
import { hit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
const operation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create_paste"), key: z.string(), body: z.unknown() }).strict(),
  z
    .object({ operation: z.literal("create_collection"), key: z.string(), body: z.unknown() })
    .strict(),
])
const batch = z.object({ operations: z.array(operation).min(1).max(20) }).strict()

export async function POST(request: Request) {
  return withToken(request, "write", async (owner) => {
    const { operations } = batch.parse(await readJson(request, 8 * 1024 * 1024))
    const results = []
    for (const [index, item] of operations.entries()) {
      try {
        const quota = await hit([apiLimits.request(owner.tokenId)])
        if (!quota.allowed)
          throw new ApiError(429, "Too many requests. Slow down.", quota.retryAfterSeconds)
        const key = parseIdempotencyKey(item.key)
        if (!key) throw new ApiError(400, "Each operation requires an idempotency key.")
        const route = item.operation === "create_paste" ? "/api/v1/pastes" : "/api/v1/collections"
        const receipt = { tokenId: owner.tokenId, key, route, body: item.body }
        const body =
          item.operation === "create_paste"
            ? { paste: await createCapture(owner.userId, item.body, receipt) }
            : await createApiCollection(owner.userId, item.body, receipt)
        results.push({ index, key: item.key, status: 201, body })
      } catch (error) {
        if (error instanceof ApiError)
          results.push({
            index,
            key: item.key,
            status: error.status,
            body: errorBody(error.status, error.message),
            ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
          })
        else if (error instanceof ZodError)
          results.push({
            index,
            key: item.key,
            status: 400,
            body: errorBody(400, error.issues[0]?.message ?? "The operation isn't valid."),
          })
        else {
          console.error(JSON.stringify({ event: "batch_api_error", index }))
          results.push({
            index,
            key: item.key,
            status: 500,
            body: errorBody(500, "An unexpected error occurred."),
          })
        }
      }
    }
    return json({ results }, 207)
  })
}
