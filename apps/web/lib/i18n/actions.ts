"use server"

import { cookies } from "next/headers"
import { getSession } from "@/lib/auth"
import { getConfig } from "@/lib/config"
import { changePreferences } from "@/lib/preference-store"
import { isLocale, localeCookie } from "./config"

export async function setLocale(value: unknown) {
  if (!isLocale(value)) throw new Error("Unsupported locale")
  const store = await cookies()
  store.set(localeCookie, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    domain: getConfig().cookieDomain,
  })
  // Signed-in people also get notification emails in this language.
  const session = await getSession()
  if (session)
    await changePreferences(session.user.id, (current) => ({ ...current, locale: value }))
}
