"use client"

import * as React from "react"
import type { HighlighterCore } from "shiki/core"
import { detectLanguage } from "@/lib/pastes/languages"
import { grammarFor } from "./grammars"
import { loadGrammar, tokenize } from "./shiki"
import type { HighlightedLines } from "./types"

// Live highlighting for the editors. Big enough pastes would make every keystroke wait on the
// tokenizer, so past this they stay plain while being edited (the saved paste page still
// colours them, up to its own limit).
const maxLines = 1500
const maxBytes = 120_000

// Syntax-coloured lines for text being edited, or undefined while the grammar loads, for plain
// text and for very large files. Tokenizing is synchronous once the grammar is in, and runs on a
// deferred copy of the text so typing stays responsive. The lines match `content` line for line
// (a trailing newline gives a trailing empty line, like the textarea shows).
export function useHighlight(content: string, filename: string): HighlightedLines | undefined {
  const grammar = grammarFor({ name: filename, language: detectLanguage(filename).id })
  const [ready, setReady] = React.useState<{ grammar: string; core: HighlighterCore }>()
  const deferred = React.useDeferredValue(content)

  React.useEffect(() => {
    if (!grammar) return
    let cancelled = false
    loadGrammar(grammar).then(
      (core) => !cancelled && setReady({ grammar, core }),
      // A grammar that fails to load leaves the editor plain, which is fine.
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [grammar])

  return React.useMemo(() => {
    if (!grammar || ready?.grammar !== grammar) return undefined
    if (deferred.length > maxBytes || deferred.split("\n").length > maxLines) return undefined
    try {
      return tokenize(ready.core, deferred, grammar)
    } catch {
      return undefined
    }
  }, [grammar, ready, deferred])
}
