export const locales = ["en", "de", "es", "zh", "ja"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "en"
export const localeCookie = "sniptide-locale"

export const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  zh: "简体中文",
  ja: "日本語",
}

export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value)
}

export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie

  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [language = "", ...parameters] = entry.trim().split(";")
      const quality = parameters.find((part) => part.trim().startsWith("q="))
      const weight = quality === undefined ? 1 : Number(quality.trim().slice(2))
      return { language: language.toLowerCase().split("-")[0], weight }
    })
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight)

  for (const { language } of preferences) {
    if (isLocale(language)) return language
  }
  return defaultLocale
}
