import { setLocale } from "@/lib/i18n/actions"
import { isLocale } from "@/lib/i18n/config"

export async function POST(request: Request) {
  const locale: unknown = await request.json().catch(() => null)
  if (!isLocale(locale)) return Response.json({ ok: false }, { status: 400 })
  await setLocale(locale)
  return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } })
}
