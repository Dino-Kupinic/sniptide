import { getAuth } from "@/lib/auth"
import { withResolvedIp } from "@/lib/client-ip"
import { forwardRequest } from "@/lib/forward-request"

// Room for the largest legitimate body, an avatar data URL (64 KB) in JSON.
const MAX_BODY_BYTES = 128 * 1024

function tooLarge() {
  return Response.json({ message: "That request is too large." }, { status: 413 })
}

async function handler(request: Request) {
  const auth = await getAuth()
  const headers = withResolvedIp(request.headers)
  if (request.method !== "POST") return auth.handler(forwardRequest(request, headers))

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge()
  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BODY_BYTES) return tooLarge()

  return auth.handler(forwardRequest(request, headers, body))
}

export { handler as GET, handler as POST }
