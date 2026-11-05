import { defineI18n } from "fumadocs-core/i18n"

// The app's five languages (apps/web/messages). English pages sit at the root and the others under
// their code, such as /de/mcp. A page without a translation (index.de.mdx next to index.mdx) shows
// the English text inside the translated interface.
export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: ["en", "de", "es", "ja", "zh"],
  hideLocale: "default-locale",
  parser: "dot",
})

export type Locale = (typeof i18n.languages)[number]

export function isLocale(value: string | undefined): value is Locale {
  return (i18n.languages as string[]).includes(value ?? "")
}

// A path on this site in the given language: English keeps the bare path, and the others gain
// their code as the first segment.
export function localePath(lang: string, path: string) {
  if (lang === i18n.defaultLanguage || !path.startsWith("/")) return path
  if (isLocale(path.split("/")[1])) return path
  return `/${lang}${path === "/" ? "" : path}`
}

// The path without its language segment, for matching it against the sections.
export function stripLocale(pathname: string) {
  const first = pathname.split("/")[1]
  if (!isLocale(first)) return pathname
  return pathname.slice(first.length + 1) || "/"
}
