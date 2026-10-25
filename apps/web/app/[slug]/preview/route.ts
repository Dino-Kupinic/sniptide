import { pastePreviewImage } from "@/components/paste/preview-image"
import { readPublicPreview } from "@/lib/pastes/store"
import { retryAfterSeconds } from "@/lib/public-limits"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: RouteContext<"/[slug]/preview">) {
  const retryAfter = await retryAfterSeconds(request, "preview")
  if (retryAfter) {
    return new Response(null, {
      status: 429,
      headers: { "cache-control": "no-store", "retry-after": String(retryAfter) },
    })
  }

  const preview = await readPublicPreview((await params).slug)
  if (!preview) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  return pastePreviewImage(preview)
}
