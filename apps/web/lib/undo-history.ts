// Undo and redo for the editor's text. The browser keeps its own stack for a textarea, but that
// stack is thrown away whenever the value is set from code (Tab inserting an indent, switching
// files), so ⌘Z would silently stop working. This keeps the history in the app instead: one entry
// per burst of typing, one per paste or indent.

export interface History {
  past: string[]
  present: string
  future: string[]
  // When the last edit was recorded, and whether the next small edit may join it.
  at: number
  open: boolean
}

// Edits closer together than this, a character at a time, share one undo step.
const GROUP_MS = 800
const LIMIT = 200

export function createHistory(value: string): History {
  return { past: [], present: value, future: [], at: 0, open: false }
}

// Records `value` as the new text. Typing and deleting a character at a time within GROUP_MS of
// the previous edit extend the current step; anything bigger, or `boundary`, starts a new one.
export function record(history: History, value: string, now: number, boundary = false): History {
  if (value === history.present) return history
  const joins =
    !boundary &&
    history.open &&
    history.past.length > 0 &&
    now - history.at < GROUP_MS &&
    Math.abs(value.length - history.present.length) <= 1
  if (joins) return { ...history, present: value, future: [], at: now }
  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: value,
    future: [],
    at: now,
    open: !boundary,
  }
}

export function undo(history: History): History | null {
  const previous = history.past.at(-1)
  if (previous === undefined) return null
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    at: 0,
    open: false,
  }
}

export function redo(history: History): History | null {
  const [next, ...future] = history.future
  if (next === undefined) return null
  return {
    past: [...history.past, history.present],
    present: next,
    future,
    at: 0,
    open: false,
  }
}

// Where the caret goes after `from` became `to`: the end of whatever changed, so undoing a paste
// leaves it where the paste started and redoing leaves it after the paste.
export function caretAfter(from: string, to: string): number {
  let prefix = 0
  const shortest = Math.min(from.length, to.length)
  while (prefix < shortest && from[prefix] === to[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < shortest - prefix &&
    from[from.length - 1 - suffix] === to[to.length - 1 - suffix]
  ) {
    suffix += 1
  }
  return to.length - suffix
}
