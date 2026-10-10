import type { LanguageInput } from "shiki/core"
import { getLanguage } from "@/lib/pastes/languages"
import type { PasteFile } from "@/lib/pastes/types"

// Language ids Sniptide knows (lib/pastes/languages.ts) to Shiki grammars. Plain text has none.
const grammars: Record<string, string> = {
  typescript: "typescript",
  javascript: "javascript",
  sql: "sql",
  shell: "shellscript",
  python: "python",
  nginx: "nginx",
  docker: "dockerfile",
  yaml: "yaml",
  go: "go",
  hcl: "hcl",
  json: "json",
  markdown: "markdown",
}

// The file's extension can pick a closer grammar than its language (JSX in a "TypeScript" file,
// a compose file that Sniptide files under Docker).
const byExtension: Record<string, Record<string, string>> = {
  typescript: { tsx: "tsx" },
  javascript: { jsx: "jsx" },
  hcl: { tf: "terraform" },
  docker: { yml: "yaml", yaml: "yaml" },
}

// Explicit imports, so the bundler splits out just these grammars and the editor downloads one
// only when a file needs it (Shiki's own `bundledLanguages` would add all 300).
export const grammarLoaders: Record<string, LanguageInput> = {
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  sql: () => import("@shikijs/langs/sql"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  python: () => import("@shikijs/langs/python"),
  nginx: () => import("@shikijs/langs/nginx"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  yaml: () => import("@shikijs/langs/yaml"),
  go: () => import("@shikijs/langs/go"),
  hcl: () => import("@shikijs/langs/hcl"),
  terraform: () => import("@shikijs/langs/terraform"),
  json: () => import("@shikijs/langs/json"),
  markdown: () => import("@shikijs/langs/markdown"),
}

export function grammarFor(file: Pick<PasteFile, "name" | "language">): string | undefined {
  const language = getLanguage(file.language).id
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined
  return (extension && byExtension[language]?.[extension]) || grammars[language]
}
