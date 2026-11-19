"use client"

import * as React from "react"
import { detectLanguage } from "@/lib/pastes/languages"
import { isLargeEditorContent } from "./editor-limits"
import { grammarFor } from "./grammars"
import type { HighlightedLines } from "./types"

export function editorGrammar(content: string, filename: string) {
  if (!content) return undefined
  const grammar = grammarFor({ name: filename, language: detectLanguage(filename).id })
  return grammar && !isLargeEditorContent(content) ? grammar : undefined
}

// Syntax-coloured lines for text being edited, or undefined while the grammar loads, for plain
// text and for very large files. Tokenizing is synchronous once the grammar is in, and runs on a
// deferred copy of the text so typing stays responsive. The lines match `content` line for line
// (a trailing newline gives a trailing empty line, like the textarea shows).
export function useHighlight(content: string, filename: string): HighlightedLines | undefined {
  const deferred = React.useDeferredValue(content)
  const deferredName = React.useDeferredValue(filename)
  const grammar = React.useMemo(
    () => editorGrammar(deferred, deferredName),
    [deferred, deferredName],
  )
  const [ready, setReady] = React.useState<{
    grammar: string
    highlight: (code: string) => HighlightedLines
  }>()

  React.useEffect(() => {
    if (!grammar) return
    let cancelled = false
    async function load(language: string) {
      try {
        const { loadGrammar, tokenize } = await import("./shiki")
        if (cancelled) return
        const core = await loadGrammar(language)
        if (!cancelled)
          setReady({ grammar: language, highlight: (code) => tokenize(core, code, language) })
      } catch {
        // Keep the plain text when the engine or grammar cannot load.
      }
    }
    void load(grammar)
    return () => {
      cancelled = true
    }
  }, [grammar])

  const lines = React.useMemo(() => {
    if (!grammar || ready?.grammar !== grammar) return undefined
    try {
      return ready.highlight(deferred)
    } catch {
      return undefined
    }
  }, [grammar, ready, deferred])

  return deferred === content && deferredName === filename ? lines : undefined
}
