import { getSession } from "@/lib/auth"
import { isSameOrigin } from "@/lib/env/http"
import { BodyTooLargeError, readBody } from "@/lib/request-body"
import { answer, conversationSchema } from "@/lib/support/assistant"
import { deploymentVersion, instanceType, noStore } from "@/lib/support/server"

export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 128 * 1024

function fail(status: number, error: string, headers?: HeadersInit) {
  return Response.json({ ok: false, error }, { status, headers: { ...noStore, ...headers } })
}

// One turn with the support assistant. The browser keeps the conversation and sends all of it.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "forbidden")
  const session = await getSession()
  if (!session) return fail(401, "unauthorized")

  let body: { messages?: unknown; url?: unknown; browser?: unknown }
  try {
    body = JSON.parse(new TextDecoder().decode(await readBody(request, MAX_BODY_BYTES)))
  } catch (error) {
    return error instanceof BodyTooLargeError ? fail(413, "too_large") : fail(400, "invalid")
  }
  const conversation = conversationSchema.safeParse(body?.messages)
  if (!conversation.success) return fail(400, "invalid")
  const url = typeof body.url === "string" ? body.url.slice(0, 2048) : ""
  const browser = typeof body.browser === "string" ? body.browser.slice(0, 512) : ""

  const result = await answer({
    conversation: conversation.data,
    context: {
      url,
      browser,
      version: deploymentVersion(),
      userId: session.user.id,
      instance: instanceType(),
    },
  })
  if (result.ok)
    return Response.json(
      { ok: true, reply: result.reply, issue: result.issue },
      { headers: noStore },
    )
  if (result.reason === "not_configured") return fail(404, "not_configured")
  if (result.reason === "rate_limited")
    return fail(429, "rate_limited", { "retry-after": String(result.retryAfterSeconds ?? 60) })
  return fail(502, "failed")
}
