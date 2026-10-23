import "server-only"

import { headers } from "next/headers"
import { getConfig } from "@/lib/config"

// Origin that share links use. SHARE_URL pins it when share links live on a different domain than
// the app (sniptide.com/k7Qe2x while the dashboard runs on app.sniptide.com). Without it, it's the
// origin of the current request: localhost:3000/k7Qe2x in dev, the instance's own domain when
// self-hosted.
export async function getSiteOrigin() {
  const { shareUrl } = getConfig()
  if (shareUrl) {
    const url = new URL(shareUrl)
    return { origin: url.origin, host: url.host }
  }

  const requestHeaders = await headers()
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000"
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")

  return { origin: `${protocol}://${host}`, host }
}

// Origin of the app's own pages (sign-in, dashboard, new paste). Empty when they live on the same
// domain as share links, so hrefs stay relative; with SHARE_URL set it's BETTER_AUTH_URL's origin.
// Share pages link there with plain <a> tags: on sniptide.com a client-side <Link> would prefetch
// pages that redirect cross-origin (blocked by CORS) or fetch RSC payloads from the site's own
// Next app, which the share page's router can't read.
export function getAppOrigin() {
  const { shareUrl, appUrl } = getConfig()
  if (!shareUrl || !appUrl) return ""

  const app = new URL(appUrl)
  return app.host === new URL(shareUrl).host ? "" : app.origin
}
