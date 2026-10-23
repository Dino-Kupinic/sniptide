import { languageData } from "./language-data"

// Every language Shiki can highlight, plus plain text. The table is generated (see
// scripts/generate-languages.ts); this module looks languages up by id and by file name.

export interface LanguageData {
  id: string
  name: string
  // Shiki's id, where Sniptide stores a different one ("shell" for Shiki's "shellscript").
  grammar?: string
  extensions: string[]
  filenames?: string[]
  // A logo in public/languages, from Material Icon Theme. `iconLight` means it has a variant
  // drawn for light backgrounds at `<icon>-light.svg`.
  icon: string
  iconLight?: boolean
}

export type Language = LanguageData

// Sorted by name.
export const languages: Language[] = languageData

// The languages people paste most, after GitHub's Octoverse and the Stack Overflow survey, with
// JSON and YAML in for the configuration that makes up much of what gets pasted. The picker lists
// them first.
export const popularLanguageIds = [
  "typescript",
  "javascript",
  "python",
  "shell",
  "sql",
  "json",
  "yaml",
  "go",
  "rust",
  "java",
]

const byId = new Map(languages.map((language) => [language.id, language]))
const plainText = byId.get("text") as Language
const byFilename = new Map(
  languages.flatMap((language) =>
    (language.filenames ?? []).map((name) => [name.toLowerCase(), language] as const),
  ),
)
const byExtension = new Map(
  languages.flatMap((language) => language.extensions.map((ext) => [ext, language] as const)),
)

// Popular first, then the rest by name, with plain text closing the popular group.
export const pickerGroups: { id: "popular" | "all"; items: Language[] }[] = [
  {
    id: "popular",
    items: [...popularLanguageIds.map((id) => byId.get(id) as Language), plainText],
  },
  {
    id: "all",
    items: languages.filter(
      (language) => language !== plainText && !popularLanguageIds.includes(language.id),
    ),
  },
]

export function getLanguage(id: string): Language {
  return byId.get(id) ?? plainText
}

// Picks a language from a file name: exact names first (crontab, Dockerfile), then the extension.
export function detectLanguage(filename: string): Language {
  const name = filename.trim()
  const exact = byFilename.get(name.toLowerCase())
  if (exact) return exact

  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : name.toLowerCase()
  return (extension && byExtension.get(extension)) || plainText
}

// Languages a file is better named for as a whole than by an extension.
const wholeNames = new Set(["docker", "nginx", "make"])

// The file name for `filename` written in `language`, used when the language is picked by hand
// (the language comes from the name, so picking one renames the file). Keeps the base name and
// swaps the extension; languages known by a whole name (Dockerfile) take that name.
export function renameForLanguage(filename: string, language: Language): string {
  const name = filename.trim()
  if (detectLanguage(name).id === language.id) return name
  const [wholeName] = language.filenames ?? []
  if (wholeName && (wholeNames.has(language.id) || !language.extensions.length)) return wholeName

  const known = byFilename.has(name.toLowerCase())
  const dot = name.lastIndexOf(".")
  const base = known ? "untitled" : dot > 0 ? name.slice(0, dot) : name || "untitled"
  return `${base}.${language.extensions[0]}`
}

// Search in the picker matches the name, the id and the extensions, so "rs" finds Rust.
export function matchesLanguage(language: Language, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^\./, "")
  if (!q) return true
  return (
    language.name.toLowerCase().includes(q) ||
    language.id.includes(q) ||
    language.extensions.includes(q)
  )
}
