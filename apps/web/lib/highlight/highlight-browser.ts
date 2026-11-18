import { detectLanguage } from "@/lib/pastes/languages"
import { isLargeEditorContent } from "./editor-limits"
import { grammarFor } from "./grammars"
import { loadGrammar, tokenize } from "./shiki"
import type { HighlightedLines } from "./types"

export interface BrowserHighlightedFile {
  name: string
  language: string
  content: string
  lines?: HighlightedLines
}

// Syntax colours computed in the browser, for files the server never sees in the clear (an
// end-to-end encrypted paste after it is decrypted). The language comes from the file name, as it
// does when a paste is saved. A grammar that fails to load, plain text and very large files stay
// uncoloured, like on the server.
export async function highlightInBrowser(
  files: { name: string; content: string }[],
): Promise<BrowserHighlightedFile[]> {
  return Promise.all(
    files.map(async ({ name, content }) => {
      const language = detectLanguage(name).id
      const file = { name, language, content }
      const grammar = grammarFor(file)
      if (!grammar || isLargeEditorContent(content)) return file
      try {
        // Same trailing-newline handling as the code view, so the lines line up.
        const lines = tokenize(await loadGrammar(grammar), content.replace(/\n$/, ""), grammar)
        return { ...file, lines }
      } catch {
        return file
      }
    }),
  )
}
