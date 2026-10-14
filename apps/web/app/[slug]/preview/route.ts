import { pastePreviewImage } from "@/components/paste/preview-image"
import { readPublicPreview } from "@/lib/pastes/store"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: RouteContext<"/[slug]/preview">) {
  const preview = await readPublicPreview((await params).slug)
  if (!preview) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  return pastePreviewImage(preview)
}
