import "server-only"

import { cookies, headers } from "next/headers"
import { defaultLocale, type Locale, localeCookie, resolveLocale } from "@/lib/i18n/config"

function cookieValue(header: string | null, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=")
    if (key === name) return decodeURIComponent(value.join("="))
  }
  return undefined
}

// The language of the person who asked for an email: their saved choice, else their browser's.
// Auth emails go out while that person's request is open, so they use its headers. Better Auth
// passes the request when it has one; otherwise the Next request in scope answers.
export async function requestLocale(request?: Request): Promise<Locale> {
  if (request)
    return resolveLocale(
      cookieValue(request.headers.get("cookie"), localeCookie),
      request.headers.get("accept-language"),
    )
  try {
    const [store, requestHeaders] = await Promise.all([cookies(), headers()])
    return resolveLocale(store.get(localeCookie)?.value, requestHeaders.get("accept-language"))
  } catch {
    return defaultLocale
  }
}
