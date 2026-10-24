import { getSession } from "@/lib/auth"
import { subscribeToChanges } from "@/lib/live/changes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Comments keep idle proxies and load balancers from closing the stream.
const HEARTBEAT_MS = 25_000

// A server-sent event stream that says "change" whenever the signed-in account's pastes or
// collections change, so open tabs can fetch fresh data. It never carries the data itself.
export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json(
      { ok: false, error: "Sign in to follow changes." },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    )
  }

  const encoder = new TextEncoder()
  let close = () => {}
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          close()
        }
      }
      const unsubscribe = await subscribeToChanges(session.user.id, () =>
        send("event: change\ndata: {}\n\n"),
      )
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS)
      close = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {}
      }
      if (request.signal.aborted) return close()
      request.signal.addEventListener("abort", close, { once: true })
      // Wait 5 seconds before reconnecting after a drop.
      send("retry: 5000\n\n")
    },
    cancel() {
      close()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store, no-transform",
      connection: "keep-alive",
      // Stops nginx from buffering the stream behind a reverse proxy.
      "x-accel-buffering": "no",
    },
  })
}
