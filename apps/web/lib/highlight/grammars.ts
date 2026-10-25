import { getLanguage } from "@/lib/pastes/languages"
import type { PasteFile } from "@/lib/pastes/types"

// The file's extension can pick a closer grammar than its language (JSX in a "TypeScript" file,
// a compose file that Sniptide files under Docker, a .tf file saved before Terraform had its own
// language).
const byExtension: Record<string, Record<string, string>> = {
  typescript: { tsx: "tsx" },
  javascript: { jsx: "jsx" },
  hcl: { tf: "terraform" },
  docker: { yml: "yaml", yaml: "yaml" },
}

// Each of Shiki's grammars is its own dynamic import (./grammar-loaders.ts), so the bundler splits
// every one into a chunk and the editor downloads a grammar only when a file needs it.
export { grammarLoaders } from "./grammar-loaders"

export function grammarFor(file: Pick<PasteFile, "name" | "language">): string | undefined {
  const language = getLanguage(file.language)
  if (language.id === "text") return undefined
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined
  return (extension && byExtension[language.id]?.[extension]) || (language.grammar ?? language.id)
}
