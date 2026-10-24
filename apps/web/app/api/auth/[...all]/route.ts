import { getAuth } from "@/lib/auth"
import { withResolvedIp } from "@/lib/client-ip"
import { forwardRequest } from "@/lib/forward-request"
import { BodyTooLargeError, readBody } from "@/lib/request-body"

export const dynamic = "force-dynamic"

// Room for the largest legitimate body, an avatar data URL (64 KB) in JSON.
const MAX_BODY_BYTES = 128 * 1024

function tooLarge() {
  return Response.json({ message: "That request is too large." }, { status: 413 })
}

async function handler(request: Request) {
  const auth = await getAuth()
  const headers = withResolvedIp(request.headers)
  if (request.method !== "POST") return auth.handler(forwardRequest(request, headers))

  let body: ArrayBuffer
  try {
    body = await readBody(request, MAX_BODY_BYTES)
  } catch (error) {
    if (error instanceof BodyTooLargeError) return tooLarge()
    return Response.json({ message: "That request couldn't be read." }, { status: 400 })
  }

  return auth.handler(forwardRequest(request, headers, body))
}

export { handler as GET, handler as POST }
