import "server-only"

import { getConfig } from "@/lib/config"

export const secretHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
}
export function secretJson(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { ...secretHeaders, ...headers } })
}
// Whether a browser request comes from this app. The standalone server sees its own address in
// request.url (0.0.0.0:3000 behind a reverse proxy), so the Origin is compared with
// BETTER_AUTH_URL and with the host the proxy forwarded instead.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false
  const { appUrl } = getConfig()
  if (appUrl && origin === new URL(appUrl).origin) return true
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    new URL(request.url).host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
export async function boundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new Error("Request too large.")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing request.")
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.length
      if (length > maxBytes) throw new Error("Request too large.")
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel()
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(result))
}
