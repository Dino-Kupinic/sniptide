import { type NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"
import { SESSION_COOKIE, validSession } from "@/lib/session"

// Every page and action needs the operator's session, except the sign-in page itself.
export function proxy(request: NextRequest) {
  const signedIn = validSession(request.cookies.get(SESSION_COOKIE)?.value, getConfig().password)
  if (signedIn || request.nextUrl.pathname === "/sign-in") return NextResponse.next()
  if (request.method !== "GET") return new NextResponse(null, { status: 401 })
  return NextResponse.redirect(new URL("/sign-in", request.url))
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
}
