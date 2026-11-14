import type { CaptureInput, Visibility } from "@sniptide/sdk"

// Turns what the reader selected in the editor into a paste. Pure, so the rules are tested
// without the editor: the file keeps its name (the server reads the language from the extension,
// as the web editor does), the title names the file and the lines, and a selection from a saved
// file records its line range.

export const MAX_TITLE = 120

export interface EditorSelection {
  text: string
  // The file's base name, or an empty string for a document that was never saved.
  fileName: string
  // The editor's language ID, such as "typescriptreact". Names a file that has no name yet.
  languageId: string
  // The selected lines, counted from 1. Null when the whole file or several selections are sent.
  lines: { start: number; end: number } | null
}

// File extensions for the editor's language IDs, used to name a document that has no file yet.
// A language that is missing here is saved as text.
const EXTENSIONS: Record<string, string> = {
  bat: "bat",
  c: "c",
  clojure: "clj",
  cpp: "cpp",
  csharp: "cs",
  css: "css",
  dart: "dart",
  diff: "diff",
  dockerfile: "dockerfile",
  elixir: "ex",
  fsharp: "fs",
  go: "go",
  graphql: "graphql",
  haskell: "hs",
  html: "html",
  ini: "ini",
  java: "java",
  javascript: "js",
  javascriptreact: "jsx",
  json: "json",
  jsonc: "jsonc",
  kotlin: "kt",
  less: "less",
  lua: "lua",
  makefile: "mk",
  markdown: "md",
  mdx: "mdx",
  "objective-c": "m",
  perl: "pl",
  php: "php",
  powershell: "ps1",
  prisma: "prisma",
  python: "py",
  r: "r",
  ruby: "rb",
  rust: "rs",
  scala: "scala",
  scss: "scss",
  shellscript: "sh",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  terraform: "tf",
  toml: "toml",
  typescript: "ts",
  typescriptreact: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  zig: "zig",
}

export function fileNameFor(selection: Pick<EditorSelection, "fileName" | "languageId">) {
  if (selection.fileName) return selection.fileName
  const extension = EXTENSIONS[selection.languageId] ?? "txt"
  return extension === "dockerfile" ? "Dockerfile" : `snippet.${extension}`
}

// "auth.ts:12-30" for a range, "auth.ts:12" for one line and "auth.ts" for the whole file.
export function titleFor(selection: EditorSelection) {
  const name = fileNameFor(selection)
  const { lines } = selection
  const range = !lines
    ? ""
    : lines.start === lines.end
      ? `:${lines.start}`
      : `:${lines.start}-${lines.end}`
  // A long file name loses its start, so the extension and the lines stay readable.
  const room = MAX_TITLE - range.length
  return `${name.length > room ? `…${name.slice(name.length - room + 1)}` : name}${range}`
}

export function captureFromSelection(
  selection: EditorSelection,
  options: { visibility: Visibility; title?: string; collection?: string | null },
): CaptureInput {
  return {
    title: options.title?.trim() || titleFor(selection),
    visibility: options.visibility,
    ...(options.collection ? { collection: options.collection } : {}),
    files: [
      {
        name: fileNameFor(selection),
        content: selection.text,
        // The range points into a file on disk, so an unsaved document sends none.
        ...(selection.lines && selection.fileName ? { lines: selection.lines } : {}),
      },
    ],
  }
}
