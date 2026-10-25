import { recordCopy } from "@/lib/pastes/store"
import { retryAfterSeconds } from "@/lib/public-limits"

// The share page's Copy button reports a copy here (a beacon, so it never slows the copy down).
// It answers 204 whatever happened to a paste: the counter is not something to probe a paste's
// existence by. A visitor sending far more copies than a person makes is told to wait instead.
export async function POST(request: Request, { params }: RouteContext<"/[slug]/copy">) {
  const headers = { "cache-control": "private, no-store" }
  const retryAfter = await retryAfterSeconds(request, "copy")
  if (retryAfter) {
    return new Response(null, {
      status: 429,
      headers: { ...headers, "retry-after": String(retryAfter) },
    })
  }

  await recordCopy((await params).slug)
  return new Response(null, { status: 204, headers })
}
