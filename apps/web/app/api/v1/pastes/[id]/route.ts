import { failure, json, readJson, withToken } from "@/lib/api/http"
import {
  getCapture,
  recordTokenReads,
  trashCapture,
  updateCapture,
  updateSettings,
} from "@/lib/api/pastes"

export const dynamic = "force-dynamic"

// One of the token owner's pastes with every file, by id or slug. `sniptide pull <id>`.
export async function GET(request: Request, { params }: RouteContext<"/api/v1/pastes/[id]">) {
  const { id } = await params
  return withToken(request, "read", async ({ userId }) => {
    const paste = id.length <= 64 ? await getCapture(userId, id) : null
    if (!paste) return failure(404, "No paste with that id.")
    await recordTokenReads(userId, [paste.id])
    return json({ paste })
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

// Changes sharing settings only: visibility, expiry, password and burn after read.
export async function PATCH(request: Request, { params }: RouteContext<"/api/v1/pastes/[id]">) {
  const { id } = await params
  return withToken(request, "write", async ({ userId }) => {
    if (id.length > 64) return failure(404, "No paste with that id.")
    return json(await updateSettings(userId, id, await readJson(request, 4 * 1024)))
  })
}

// Moves the paste to the trash. It can be restored from the app until the trash is emptied.
export async function DELETE(request: Request, { params }: RouteContext<"/api/v1/pastes/[id]">) {
  const { id } = await params
  return withToken(request, "write", async ({ userId }) => {
    if (id.length > 64) return failure(404, "No paste with that id.")
    return json(await trashCapture(userId, id))
  })
}
