import "server-only"

import { timingSafeEqual } from "node:crypto"

export function operationsAuthFailure(request: Request): Response | null {
  const token = process.env.METRICS_TOKEN
  const headers = { "cache-control": "private, no-store" }
  if (!token) return new Response("Not found", { status: 404, headers })
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  const expected = Buffer.from(token)
  const actual = Buffer.from(supplied)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return new Response("Unauthorized", { status: 401, headers })
  return null
}
