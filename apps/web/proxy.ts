import { type NextRequest, NextResponse } from "next/server"
import { RETURN_TO_HEADER } from "@/lib/auth-redirect"
import { ROUTE_SEPARATOR } from "@/lib/pastes/links"

// Custom links live at /@<handle>/<name>, and the paste pages below them at /@<handle>/<name>/raw
// and so on. Next.js routes one segment per dynamic folder, so these are served from the
// internal segment "<handle>~<name>" that the [slug] routes read back with slugFromRoute.
function customLinkRoute(path: string, prefix: "" | "/pastes") {
  const match = new RegExp(
    `^${prefix}/(?:@|%40)([a-z0-9_-]{3,30})/([A-Za-z0-9_-]{1,40})(/[^/]+)?/?$`,
    "i",
  ).exec(path)
  if (!match?.[1] || !match[2]) return null
  return `${prefix}/${match[1].toLowerCase()}${ROUTE_SEPARATOR}${match[2]}${match[3] ?? ""}`
}

// When SHARE_URL puts share links on their own domain and that domain points at this app too,
// keep the share domain for share links only: app pages there redirect to the app's domain
// (BETTER_AUTH_URL). Without SHARE_URL, or when both are the same domain, nothing changes.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  // Public profiles live at /@<handle>. A folder named @handle would be a parallel route slot, so
  // the page sits at the internal /_profile/<handle> and only the /@ address is served.
  const profile = /^\/(?:@|%40)([^/]+)$/i.exec(path)
  if (profile) {
    const url = request.nextUrl.clone()
    url.pathname = `/_profile/${profile[1]}`
    return NextResponse.rewrite(url)
  }
  if (/^\/_profile(?:\/|$)/.test(path)) {
    const url = request.nextUrl.clone()
    url.pathname = `/@${path.split("/")[2] ?? ""}`
    return NextResponse.redirect(url, 308)
  }
  // The internal segment is never an address of its own.
  const internal = /^(\/pastes)?\/([a-z0-9_-]{3,30})~([A-Za-z0-9_-]{1,40})(\/.*)?$/.exec(path)
  if (internal) {
    const url = request.nextUrl.clone()
    url.pathname = `${internal[1] ?? ""}/@${internal[2]}/${internal[3]}${internal[4] ?? ""}`
    return NextResponse.redirect(url, 308)
  }
  const appPath =
    /^\/(?:api|\.well-known|_next|_site|analytics|collections|dashboard|demo|dev|docs|forgot-password|new|oauth|pastes|reset-password|secrets|secret-share|settings|shared|sign-in|sign-up|starred|trash|welcome)(?:\/|$)/.test(
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
  const shareRoute = customLinkRoute(path, "")
  if (shareRoute) {
    const url = request.nextUrl.clone()
    url.pathname = shareRoute
    return NextResponse.rewrite(url)
  }
  // The workspace pages of a custom link: /pastes/@<handle>/<name> and its /edit.
  const next = () => {
    const pasteRoute = customLinkRoute(path, "/pastes")
    if (!pasteRoute) {
      // Tells requireSession which page to return to after sign-in, replacing any client value.
      const headers = new Headers(request.headers)
      headers.set(RETURN_TO_HEADER, `${path}${request.nextUrl.search}`)
      return NextResponse.next({ request: { headers } })
    }
    const url = request.nextUrl.clone()
    url.pathname = pasteRoute
    return NextResponse.rewrite(url)
  }
  if (
    path !== "/" &&
    !/^\/(?:sign-in|sign-up|forgot-password|reset-password|dashboard|analytics|new|oauth|pastes|settings|shared|starred|trash|collections|secrets|welcome)(?:\/|$)/.test(
      path,
    ) &&
    !path.startsWith("/api/auth/")
  )
    return next()
  const shareUrl = process.env.SHARE_URL
  const appUrl = process.env.BETTER_AUTH_URL
  if (!shareUrl || !appUrl) return next()

  const shareHost = new URL(shareUrl).host
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (host !== shareHost || shareHost === new URL(appUrl).host) return next()

  const { pathname, search } = request.nextUrl
  return NextResponse.redirect(new URL(`${pathname}${search}`, appUrl), 308)
}

// The app's own pages; everything else (share links, raw files, assets) is served on any domain.
export const config = {
  matcher: [
    "/((?!_next|api|_site).*)",
    "/",
    "/(sign-in|sign-up|forgot-password|reset-password|dashboard|analytics|new|oauth|pastes|settings|shared|starred|trash|collections|secrets|welcome)/:path*",
    "/api/auth/:path*",
  ],
}
