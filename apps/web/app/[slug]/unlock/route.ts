import { cookies } from "next/headers"
import { clientAddress } from "@/lib/client-ip"
import { verifyPassword } from "@/lib/pastes/passwords"
import { getUnlockHash } from "@/lib/pastes/store"
import { unlockCookieName, unlockToken } from "@/lib/pastes/unlock"
import { hit, type Limit, refund } from "@/lib/rate-limit"

// The longest password a paste can have (see the save schema) and the most this route will read.
const MAX_PASSWORD_LENGTH = 200
const MAX_BODY_BYTES = 1024

// Each attempt counts before the password is checked, so simultaneous guesses can't outrun the
// limit, and is given back when the password turns out to be right. One limit is per visitor and
// paste, the other per paste for everyone, which also bounds guessing spread across many visitors.
function limitsFor(slug: string, client: string): Limit[] {
  return [
    { key: `unlock:client:${slug}:${client}`, max: 8, windowSeconds: 15 * 60 },
    { key: `unlock:paste:${slug}`, max: 60, windowSeconds: 60 * 60 },
  ]
}

function fail(status: number, error: string, headers?: HeadersInit) {
  return Response.json({ ok: false, error }, { status, headers })
}

// Password gate on the public page. The cookie holds a hash of the slug and the stored password
// hash, so it stops working when the password changes and can't be minted from outside.
//
// A route handler rather than a server action: on sniptide.com the page is proxied from the app,
// and Next rejects a server action whose Origin (sniptide.com) differs from the app's host.
export async function POST(request: Request, { params }: RouteContext<"/[slug]/unlock">) {
  const { slug } = await params

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) return fail(413, "That request is too large.")
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return fail(413, "That request is too large.")

  let body: { password?: unknown } | null = null
  try {
    body = JSON.parse(text)
  } catch {}
  const password = typeof body?.password === "string" ? body.password : ""
  if (password.length > MAX_PASSWORD_LENGTH) return fail(400, "That password is too long.")

  const hash = await getUnlockHash(slug)
  // Pastes that can't be unlocked answer the same as a wrong password, and cost no hashing.
  if (!hash) return fail(401, "That password isn't right.")

  const limits = limitsFor(slug, clientAddress(request.headers))
  const attempt = await hit(limits)
  if (!attempt.allowed) {
    return fail(429, "Too many attempts. Try again in a few minutes.", {
      "retry-after": String(attempt.retryAfterSeconds),
    })
  }

  if (!(await verifyPassword(password, hash))) return fail(401, "That password isn't right.")
  await refund(limits)

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
