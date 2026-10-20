import "server-only"

import { ZodError } from "zod"
import { hit, type Limit } from "@/lib/rate-limit"
import { HOUR_SECONDS } from "@/lib/time"
import { authenticate, type Scope, type TokenOwner } from "./tokens"

// Shared plumbing for the token API under /api/v1: bearer authentication, scope checks, rate
// limits and JSON responses. Errors use the same `{ ok: false, error }` shape as the rest of the
// public API, and nothing a client sent is echoed back in them.

const headers = { "cache-control": "private, no-store" }

export const apiLimits = {
  // Every request a token makes, so a leaked token or a looping agent can't hammer the server.
  request: (token: string): Limit => ({
    key: `api:token:${token}`,
    max: 3600,
    windowSeconds: HOUR_SECONDS,
  }),
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers })
}

export function failure(status: number, message: string, retryAfterSeconds?: number) {
  return Response.json(
    { ok: false, error: message },
    {
      status,
      headers: {
        ...headers,
        ...(retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {}),
      },
    },
  )
}

// Reads a JSON body of at most `maxBytes`, or throws a 400/413.
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length > maxBytes) throw new ApiError(413, "The request body is too large.")
  const text = await request.text()
  if (Buffer.byteLength(text) > maxBytes) throw new ApiError(413, "The request body is too large.")
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(400, "The request body isn't valid JSON.")
  }
}

// Runs `handler` for a request whose token has `scope`, turning thrown errors into responses.
export async function withToken(
  request: Request,
  scope: Scope,
  handler: (owner: TokenOwner) => Promise<Response>,
): Promise<Response> {
  try {
    const owner = await authenticate(request)
    if (!owner) return failure(401, "The API token is missing, invalid, expired or revoked.")
    if (!owner.scopes.includes(scope))
      return failure(403, `This token doesn't have the ${scope} scope.`)
    const limit = await hit([apiLimits.request(owner.tokenId)])
    if (!limit.allowed)
      return failure(429, "Too many requests. Slow down.", limit.retryAfterSeconds)
    return await handler(owner)
  } catch (error) {
    if (error instanceof ApiError)
      return failure(error.status, error.message, error.retryAfterSeconds)
    if (error instanceof ZodError)
      return failure(400, error.issues[0]?.message ?? "The request isn't valid.")
    throw error
  }
}
