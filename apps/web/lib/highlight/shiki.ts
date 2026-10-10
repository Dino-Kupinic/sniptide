import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import { grammarLoaders } from "./grammars"
import { roleOf, theme, themeName } from "./theme"
import type { HighlightedLines, HighlightedToken, HighlightRole } from "./types"

// The Shiki setup shared by the server (paste pages) and the browser (the editors): one
// highlighter, grammars loaded on first use, tokens turned into HighlightedLines.

let highlighter: Promise<HighlighterCore> | undefined
const loading = new Map<string, Promise<void>>()

export function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [theme],
    langs: [],
    // Pure JavaScript regexes: no WebAssembly to ship, in the standalone server or the browser.
    engine: createJavaScriptRegexEngine(),
  })
  return highlighter
}

// Resolves once the grammar can tokenize; the highlighter itself, to tokenize with.
export async function loadGrammar(grammar: string): Promise<HighlighterCore> {
  const core = await getHighlighter()
  if (core.getLoadedLanguages().includes(grammar)) return core

  let pending = loading.get(grammar)
  if (!pending) {
    const input = grammarLoaders[grammar]
    if (!input) throw new Error(`No grammar loader for ${grammar}`)
    pending = core.loadLanguage(input).finally(() => loading.delete(grammar))
    loading.set(grammar, pending)
  }
  await pending
  return core
}

// Needs the grammar loaded already (see loadGrammar).
export function tokenize(core: HighlighterCore, code: string, grammar: string): HighlightedLines {
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
