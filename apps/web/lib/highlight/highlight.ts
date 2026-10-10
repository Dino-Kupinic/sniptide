import "server-only"
import type { PasteFile } from "@/lib/pastes/types"
import { grammarFor } from "./grammars"
import { loadGrammar, tokenize } from "./shiki"
import type { HighlightedLines } from "./types"

export { grammarFor }

// Server-side syntax highlighting for the paste pages. Shiki tokenizes with TextMate grammars, so
// the browser only gets coloured spans and no highlighter code. Colours are CSS variables (see
// ./theme.ts), which is what lets one pass serve both the light and the dark theme. The editors
// highlight in the browser instead (./use-highlight.ts).

// Past this the payload to the browser (and the time to tokenize) outweighs the colours, so the
// file renders as plain text.
const maxLines = 2000
const maxBytes = 200_000

async function tokenizeFile(file: PasteFile): Promise<HighlightedLines | undefined> {
  const grammar = grammarFor(file)
  if (!grammar) return undefined

  // Same trailing-newline handling as the code view, so the lines line up.
  const code = file.content.replace(/\n$/, "")
  if (code.length > maxBytes || code.split("\n").length > maxLines) return undefined

  return tokenize(await loadGrammar(grammar), code, grammar)
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
        const lines = await tokenizeFile(file)
        return lines ? { ...file, lines } : file
      } catch (error) {
        console.error(`Could not highlight ${file.name}`, error)
        return file
      }
    }),
  )
}
