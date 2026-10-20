import { createTranslator } from "next-intl"
import de from "@/messages/de/core.json"
import en from "@/messages/en/core.json"
import es from "@/messages/es/core.json"
import ja from "@/messages/ja/core.json"
import zh from "@/messages/zh/core.json"
import type { Locale } from "./config"

const catalogs = { en, de, es, zh, ja }

export function coreTranslator(locale: Locale) {
  return createTranslator({ locale, messages: catalogs[locale], namespace: "Core" })
}
