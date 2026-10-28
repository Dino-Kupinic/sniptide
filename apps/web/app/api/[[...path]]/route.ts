import { failure } from "@/lib/api/errors"

function notFound() {
  return failure(404, "No API route found. See /api/openapi.json for available endpoints.")
}

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const OPTIONS = notFound
export function HEAD() {
  const response = notFound()
  return new Response(null, { status: response.status, headers: response.headers })
}
