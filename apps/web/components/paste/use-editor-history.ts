import * as React from "react"
import {
  createHistory,
  type EditKind,
  type History,
  record,
  redo,
  type Snapshot,
  undo,
} from "@/lib/editor-history"

// The editor's undo/redo, one history per file. It lives in a ref, outside the editor's state, so
// saving (or auto-saving) and the page refreshing around it leave it alone, and a file taken out
// of the tabs and put back (Undo on its toast) gets its history back with it.
export function useEditorHistory() {
  const histories = React.useRef(new Map<string, History>())

  return React.useMemo(() => {
    // `content` is what the file holds right now, which is the history's present unless the text
    // was changed behind its back; then it catches up first so Undo never jumps over those edits.
    function current(id: string, content: string) {
      const known = histories.current.get(id) ?? createHistory(content)
      if (known.present.value === content) return known
      return record(
        known,
        { value: content, selectionStart: content.length, selectionEnd: content.length },
        "other",
        Date.now(),
      )
    }

    return {
      // An edit to file `id` that took its text from `before` to `next.value`.
      edit(id: string, before: string, next: Snapshot, kind: EditKind) {
        histories.current.set(id, record(current(id, before), next, kind, Date.now()))
      },
      // The caret moved without the text changing; ignored if the text isn't what's recorded.
      moveCaret(id: string, next: Snapshot) {
        const known = histories.current.get(id) ?? createHistory(next.value)
        if (known.present.value === next.value) {
          histories.current.set(id, record(known, next, "other", Date.now()))
        }
      },
      // Steps one way. Null when there's nothing to undo or redo.
      step(id: string, content: string, direction: "undo" | "redo"): Snapshot | null {
        const known = current(id, content)
        const next = direction === "undo" ? undo(known) : redo(known)
        histories.current.set(id, next)
        return next === known ? null : next.present
      },
    }
  }, [])
}
