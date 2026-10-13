import { failure, json, withToken } from "@/lib/api/http"
import { collectionCaptures } from "@/lib/api/pastes"

// A collection's pastes in full, oldest first, a page at a time. `sniptide pull collection:<slug>`.
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/collections/[slug]/pastes">,
) {
  const { slug } = await params
  return withToken(request, "read", async ({ userId }) => {
    const cursor = new URL(request.url).searchParams.get("cursor")
    const page = slug.length <= 40 ? await collectionCaptures(userId, slug, cursor) : null
    return page ? json(page) : failure(404, "No collection with that name.")
  })
}
