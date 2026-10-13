import { failure, json, withToken } from "@/lib/api/http"
import { getCapture } from "@/lib/api/pastes"

// One of the token owner's pastes with every file, by id or slug. `sniptide pull <id>`.
export async function GET(request: Request, { params }: RouteContext<"/api/v1/pastes/[id]">) {
  const { id } = await params
  return withToken(request, "read", async ({ userId }) => {
    const paste = id.length <= 64 ? await getCapture(userId, id) : null
    return paste ? json({ paste }) : failure(404, "No paste with that id.")
  })
}
