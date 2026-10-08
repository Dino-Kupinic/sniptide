import "server-only"

import { headers } from "next/headers"

// Origin that share links use. SHARE_URL pins it when share links live on a different domain than
// the app (sniptide.com/k7Qe2x while the dashboard runs on app.sniptide.com). Without it, it's the
// origin of the current request: localhost:3000/k7Qe2x in dev, the instance's own domain when
// self-hosted.
export async function getSiteOrigin() {
  const shareUrl = process.env.SHARE_URL
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
