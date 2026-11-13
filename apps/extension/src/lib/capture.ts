import type { CaptureInput, Visibility } from "@sniptide/sdk"

// Turns what the reader selected on a page into a paste. Pure, so the rules are tested without a
// browser: the file name carries the language (the server reads it from the extension, as the
// editor does), the title is the page's, and the description records where the text came from.

export const MAX_TITLE = 120
export const MAX_DESCRIPTION = 280
export const MAX_FILE_NAME = 120

export interface PageSelection {
  text: string
  // The page's title and address, for the paste's title and description.
  title: string
  url: string
  // Class names and language attributes found around the selection, such as "language-ts".
  hints: string[]
}

// File extensions for the names sites give their code blocks. Anything else that already looks
// like an extension is used as is.
const EXTENSIONS: Record<string, string> = {
  bash: "sh",
  c: "c",
  "c#": "cs",
  "c++": "cpp",
  clojure: "clj",
  console: "sh",
  cpp: "cpp",
  csharp: "cs",
  css: "css",
  dart: "dart",
  diff: "diff",
  docker: "dockerfile",
  dockerfile: "dockerfile",
  elixir: "ex",
  erlang: "erl",
  go: "go",
  golang: "go",
  graphql: "graphql",
  haskell: "hs",
  html: "html",
  ini: "ini",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  lua: "lua",
  markdown: "md",
  md: "md",
  objectivec: "m",
  perl: "pl",
  php: "php",
  powershell: "ps1",
  py: "py",
  python: "py",
  r: "r",
  rb: "rb",
  ruby: "rb",
  rust: "rs",
  rs: "rs",
  scala: "scala",
  scss: "scss",
  sh: "sh",
  shell: "sh",
  shellsession: "sh",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  terraform: "tf",
  toml: "toml",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zig: "zig",
  zsh: "sh",
}

// Words that sit where a language would but name none.
const NOT_A_LANGUAGE = new Set(["none", "plain", "plaintext", "text", "txt", "nohighlight", "auto"])

const HINT =
  /(?:^|[\s"'])(?:language|lang|highlight-source|highlight-text|brush:)[-:\s]*([a-z0-9+#]+)/i

// The file extension for the language the page names, or null when it names none.
export function extensionFromHints(hints: string[]): string | null {
  for (const hint of hints) {
    const value = hint.trim().toLowerCase()
    if (!value) continue
    // A bare value comes from an attribute such as data-language="rust".
    const name = /^[a-z0-9+#]+$/.test(value) ? value : HINT.exec(value)?.[1]?.toLowerCase()
    if (!name || NOT_A_LANGUAGE.has(name)) continue
    const extension = EXTENSIONS[name]
    if (extension) return extension
  }
  return null
}

function looksLikeJson(text: string) {
  const trimmed = text.trim()
  if (!/^[[{]/.test(trimmed)) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export function fileNameFor(text: string, hints: string[]) {
  const extension = extensionFromHints(hints) ?? (looksLikeJson(text) ? "json" : "txt")
  return extension === "dockerfile" ? "Dockerfile" : `snippet.${extension}`
}

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

// The page's title, or the selection's first line on a page without one.
export function titleFor(selection: Pick<PageSelection, "title" | "text">) {
  const firstLine = selection.text.split("\n").find((line) => line.trim()) ?? ""
  return clip(selection.title, MAX_TITLE) || clip(firstLine, 60) || "Untitled selection"
}

// "From <address>", without the fragment and only for web pages. An address too long for the
// description falls back to its origin, so a paste never carries half a link.
export function sourceDescription(pageUrl: string) {
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    return ""
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return ""
  url.hash = ""
  url.username = ""
  url.password = ""
  const full = `From ${url.href}`
  return full.length <= MAX_DESCRIPTION ? full : `From ${url.origin}`
}

export function captureFromSelection(
  selection: PageSelection,
  options: { visibility: Visibility; includeSource: boolean },
): CaptureInput {
  return {
    title: titleFor(selection),
    description: options.includeSource ? sourceDescription(selection.url) : "",
    visibility: options.visibility,
    files: [{ name: fileNameFor(selection.text, selection.hints), content: selection.text }],
  }
}
