import { failure, json, withToken } from "@/lib/api/http"
import { collectionCaptures, recordTokenReads } from "@/lib/api/pastes"

// A collection's pastes in full, oldest first, a page at a time. `sniptide pull collection:<slug>`.
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/collections/[slug]/pastes">,
) {
  const { slug } = await params
  return withToken(request, "read", async ({ userId }) => {
    const cursor = new URL(request.url).searchParams.get("cursor")
    const page = slug.length <= 40 ? await collectionCaptures(userId, slug, cursor) : null
    if (!page) return failure(404, "No collection with that name.")
    await recordTokenReads(
      userId,
      page.pastes.map((paste) => paste.id),
    )
    return json(page)
  })
}
