import { listNotifications } from "@/lib/notifications/store"

export const dynamic = "force-dynamic"

// The signed-in account's latest notifications and how many are unread, as the bell polls them.
export async function GET() {
  const headers = { "cache-control": "private, no-store" }
  const feed = await listNotifications()
  if (!feed) {
    return Response.json(
      { ok: false, error: "Sign in to see notifications." },
      { status: 401, headers },
    )
  }
  return Response.json(feed, { headers })
}
