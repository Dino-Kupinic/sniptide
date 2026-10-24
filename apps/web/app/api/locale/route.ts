import { setLocale } from "@/lib/i18n/actions"
import { isLocale } from "@/lib/i18n/config"
import { BodyTooLargeError, readBody } from "@/lib/request-body"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let locale: unknown
  try {
    locale = JSON.parse(new TextDecoder().decode(await readBody(request, 1024)))
  } catch (error) {
    return Response.json({ ok: false }, { status: error instanceof BodyTooLargeError ? 413 : 400 })
  }
  if (!isLocale(locale)) return Response.json({ ok: false }, { status: 400 })
  await setLocale(locale)
  return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } })
}
