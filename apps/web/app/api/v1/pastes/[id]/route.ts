import { failure, json, readJson, withToken } from "@/lib/api/http"
import { getCapture, updateCapture } from "@/lib/api/pastes"

export const dynamic = "force-dynamic"

// One of the token owner's pastes with every file, by id or slug. `sniptide pull <id>`.
export async function GET(request: Request, { params }: RouteContext<"/api/v1/pastes/[id]">) {
  const { id } = await params
  return withToken(request, "read", async ({ userId }) => {
    const paste = id.length <= 64 ? await getCapture(userId, id) : null
    return paste ? json({ paste }) : failure(404, "No paste with that id.")
  })
}

export async function PUT(request: Request, { params }: RouteContext<"/api/v1/pastes/[id]">) {
  const { id } = await params
  return withToken(request, "write", async ({ userId }) => {
    if (id.length > 64) return failure(404, "No paste with that id.")
    const input = await readJson(request, 8 * 1024 * 1024)
    return json({ paste: await updateCapture(userId, id, input) })
  })
}
