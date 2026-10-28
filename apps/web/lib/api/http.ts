import "server-only"

import { ZodError } from "zod"
import { recordApiRequest } from "@/lib/account/usage"
import { hit, type Limit } from "@/lib/rate-limit"
import { isAdmissionError } from "@/lib/request-admission"
import { BodyTooLargeError, readBody } from "@/lib/request-body"
import { HOUR_SECONDS } from "@/lib/time"
import { failure } from "./errors"
import type { Scope } from "./scopes"
import { authenticate, type TokenOwner } from "./tokens"

export { failure } from "./errors"

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

// Reads a JSON body of at most `maxBytes`, or throws a 400/413.
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(await readBody(request, maxBytes)))
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new ApiError(413, error.message)
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
    await recordApiRequest(owner)
    if (!owner.scopes.includes(scope))
      return failure(403, `This token doesn't have the ${scope} scope.`)
    const limit = await hit([apiLimits.request(owner.tokenId)])
    if (!limit.allowed)
      return failure(429, "Too many requests. Slow down.", limit.retryAfterSeconds)
    return await handler(owner)
  } catch (error) {
    if (isAdmissionError(error))
      return failure(error.status, error.message, error.retryAfterSeconds)
    if (error instanceof ApiError)
      return failure(error.status, error.message, error.retryAfterSeconds)
    if (error instanceof ZodError)
      return failure(400, error.issues[0]?.message ?? "The request isn't valid.")
    console.error(JSON.stringify({ event: "token_api_error" }))
    return failure(500, "An unexpected error occurred.")
  }
}
