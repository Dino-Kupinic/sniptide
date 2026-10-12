import { recordCopy } from "@/lib/pastes/store"

// The share page's Copy button reports a copy here (a beacon, so it never slows the copy down).
// It answers 204 whatever happened: the counter is not something to probe a paste's existence by.
export async function POST(_request: Request, { params }: RouteContext<"/[slug]/copy">) {
  await recordCopy((await params).slug)
  return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } })
}
