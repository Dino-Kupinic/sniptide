import { allowedParent } from "@workspace/db/moderation"
import { notification, paste, pasteShare } from "@workspace/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getSession } from "@/lib/auth"
import { signInPath } from "@/lib/auth-redirect"
import { getDb } from "@/lib/db"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return new Response(null, { status: 404, headers })
  const viewer = (await getSession())?.user.id
  if (!viewer)
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        location: new URL(signInPath(`/api/notifications/${id}/open`), request.url).href,
      },
    })
  const [row] = await getDb()
    .select({
      slug: paste.slug,
      deletedAt: paste.deletedAt,
      expiresAt: paste.expiresAt,
      burnAfterRead: paste.burnAfterRead,
    })
    .from(notification)
    .innerJoin(paste, eq(paste.id, notification.pasteId))
    .innerJoin(
      pasteShare,
      and(
        eq(pasteShare.pasteId, paste.id),
        eq(pasteShare.userId, viewer),
        isNull(pasteShare.leftAt),
      ),
    )
    .where(
      and(
        eq(notification.id, id),
        eq(notification.userId, viewer),
        eq(notification.kind, "shared"),
        allowedParent(paste.id),
      ),
    )
  if (!row || row.deletedAt || (row.expiresAt && row.expiresAt <= new Date()))
    return new Response(null, { status: 404, headers })
  return new Response(null, {
    status: 303,
    headers: {
      ...headers,
      location: new URL(row.burnAfterRead ? `/${row.slug}` : `/pastes/${row.slug}`, request.url)
        .href,
    },
  })
}
