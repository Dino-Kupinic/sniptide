import { cookies } from "next/headers"
import { verifyPassword } from "@/lib/pastes/passwords"
import { getUnlockHash } from "@/lib/pastes/store"
import { unlockCookieName, unlockToken } from "@/lib/pastes/unlock"

// Password gate on the public page. The cookie holds a hash of the slug and the stored password
// hash, so it stops working when the password changes and can't be minted from outside.
//
// A route handler rather than a server action: on sniptide.com the page is proxied from the app,
// and Next rejects a server action whose Origin (sniptide.com) differs from the app's host.
export async function POST(request: Request, { params }: RouteContext<"/[slug]/unlock">) {
  const { slug } = await params
  const body = await request.json().catch(() => null)
  const password = typeof body?.password === "string" ? body.password : ""

  const hash = await getUnlockHash(slug)
  if (!hash || !(await verifyPassword(password, hash))) {
    return Response.json({ ok: false, error: "That password isn't right." }, { status: 401 })
  }

  const jar = await cookies()
  jar.set(unlockCookieName(slug), await unlockToken(slug, hash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return Response.json({ ok: true })
}
