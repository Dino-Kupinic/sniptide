import { failure, json, readJson, withToken } from "@/lib/api/http"
import { setCollectionSteps } from "@/lib/api/pastes"

// Sets the collection's step order and per-step instructions, which collection reads, MCP
// fetch_collection and `sniptide pull collection:<slug>` follow.
export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/v1/collections/[slug]/steps">,
) {
  const { slug } = await params
  return withToken(request, "write", async ({ userId }) => {
    if (slug.length > 40) return failure(404, "No collection with that name.")
    return json(await setCollectionSteps(userId, slug, await readJson(request, 256 * 1024)))
  })
}
