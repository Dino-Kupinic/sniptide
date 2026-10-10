import "server-only"
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import { bundledLanguages } from "shiki/langs"
import { getLanguage } from "@/lib/pastes/languages"
import type { PasteFile } from "@/lib/pastes/types"
import { roleOf, theme, themeName } from "./theme"
import type { HighlightedLines, HighlightedToken, HighlightRole } from "./types"

// Server-side syntax highlighting for paste content. Shiki tokenizes with TextMate grammars, so
// the browser only gets coloured spans and no highlighter code. Colours are CSS variables (see
// ./theme.ts), which is what lets one pass serve both the light and the dark theme.

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

// Past this the payload to the browser (and the time to tokenize) outweighs the colours, so the
// file renders as plain text.
const maxLines = 2000
const maxBytes = 200_000

let highlighter: Promise<HighlighterCore> | undefined
const loading = new Map<string, Promise<void>>()

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [theme],
    langs: [],
    // Pure JavaScript regexes: no WebAssembly to ship in the standalone server.
    engine: createJavaScriptRegexEngine(),
  })
  return highlighter
}

async function loadGrammar(core: HighlighterCore, grammar: string) {
  if (core.getLoadedLanguages().includes(grammar)) return
  let pending = loading.get(grammar)
  if (!pending) {
    const load = bundledLanguages[grammar as keyof typeof bundledLanguages]
    pending = core.loadLanguage(load).finally(() => loading.delete(grammar))
    loading.set(grammar, pending)
  }
  await pending
}

export function grammarFor(file: Pick<PasteFile, "name" | "language">): string | undefined {
  const language = getLanguage(file.language).id
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined
  return (extension && byExtension[language]?.[extension]) || grammars[language]
}

async function tokenize(file: PasteFile): Promise<HighlightedLines | undefined> {
  const grammar = grammarFor(file)
  if (!grammar) return undefined

  // Same trailing-newline handling as the code view, so the lines line up.
  const code = file.content.replace(/\n$/, "")
  if (code.length > maxBytes || code.split("\n").length > maxLines) return undefined

  const core = await getHighlighter()
  await loadGrammar(core, grammar)
  const { tokens } = core.codeToTokens(code, { lang: grammar, theme: themeName })

  return tokens.map((line) => {
    // Neighbouring tokens of one colour become one span.
    const runs: { text: string; role: HighlightRole | undefined }[] = []
    for (const token of line) {
      const role = roleOf(token.color)
      const last = runs.at(-1)
      if (last && last.role === role) last.text += token.content
      else runs.push({ text: token.content, role })
    }
    return runs.map(({ text, role }): HighlightedToken => (role ? [text, role] : text))
  })
}

export type HighlightedFile<F extends PasteFile = PasteFile> = F & { lines?: HighlightedLines }

// Adds `lines` to every file that can be highlighted. A grammar failing must never take a paste
// down with it, so those files come back unchanged and render as plain text.
export async function highlightFiles<F extends PasteFile>(
  files: F[],
): Promise<HighlightedFile<F>[]> {
  return Promise.all(
    files.map(async (file) => {
      try {
        const lines = await tokenize(file)
        return lines ? { ...file, lines } : file
      } catch (error) {
        console.error(`Could not highlight ${file.name}`, error)
        return file
      }
    }),
  )
}
