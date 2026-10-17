"use server"

import { cookies } from "next/headers"
import { getConfig } from "@/lib/config"
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
}
