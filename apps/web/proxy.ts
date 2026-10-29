import { type NextRequest, NextResponse } from "next/server"

// When SHARE_URL puts share links on their own domain and that domain points at this app too,
// keep the share domain for share links only: app pages there redirect to the app's domain
// (BETTER_AUTH_URL). Without SHARE_URL, or when both are the same domain, nothing changes.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const appPath =
    /^\/(?:api|\.well-known|_next|_site|analytics|collections|dashboard|demo|dev|docs|forgot-password|new|oauth|pastes|reset-password|secrets|secret-share|settings|shared|sign-in|sign-up|starred|trash)(?:\/|$)/.test(
      path,
    )
  const markdown = (request.headers.get("accept") ?? "").split(",").some((range) => {
    const [type, ...parameters] = range.trim().toLowerCase().split(";")
    return (
      type === "text/markdown" &&
      !parameters.some((parameter) => /^q=0(?:\.0*)?$/.test(parameter.trim()))
    )
  })
  if (
    request.method === "GET" &&
    markdown &&
    path !== "/" &&
    !appPath &&
    !/\/(?:raw|embed)(?:\/|$)/.test(path) &&
    !["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"].includes(path)
  ) {
    const url = request.nextUrl.clone()
    url.pathname = `/api/agent-share${path}`
    return NextResponse.rewrite(url, { headers: { vary: "Accept, Cookie" } })
  }
  if (
    path !== "/" &&
    !/^\/(?:sign-in|sign-up|forgot-password|reset-password|dashboard|analytics|new|oauth|pastes|settings|shared|starred|trash|collections|secrets)(?:\/|$)/.test(
      path,
    ) &&
    !path.startsWith("/api/auth/")
  )
    return NextResponse.next()
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
    "/((?!_next|api|_site).*)",
    "/",
    "/(sign-in|sign-up|forgot-password|reset-password|dashboard|analytics|new|oauth|pastes|settings|shared|starred|trash|collections|secrets)/:path*",
    "/api/auth/:path*",
  ],
}
