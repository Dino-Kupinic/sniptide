import { type NextRequest, NextResponse } from "next/server"

// When SHARE_URL puts share links on their own domain and that domain points at this app too,
// keep the share domain for share links only: app pages there redirect to the app's domain
// (BETTER_AUTH_URL). Without SHARE_URL, or when both are the same domain, nothing changes.
export function proxy(request: NextRequest) {
  const shareUrl = process.env.SHARE_URL
  const appUrl = process.env.BETTER_AUTH_URL
  if (!shareUrl || !appUrl) return NextResponse.next()

  const shareHost = new URL(shareUrl).host
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (host !== shareHost || shareHost === new URL(appUrl).host) return NextResponse.next()

  const { pathname, search } = request.nextUrl
  return NextResponse.redirect(new URL(`${pathname}${search}`, appUrl), 308)
}

// The app's own pages; everything else (share links, raw files, assets) is served on any domain.
export const config = {
  matcher: [
    "/",
    "/(sign-in|sign-up|dashboard|new|pastes|settings|shared|starred|trash|collections)/:path*",
    "/api/auth/:path*",
  ],
}
