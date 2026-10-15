// Undo/redo history for one file in the paste editor.
//
// The browser's own undo stack for a textarea can't be trusted here: it is dropped whenever the
// value is set from code (Tab indent, switching files), and what it holds isn't ours to keep
// across a save. So the editor keeps its own, as plain values: nothing in here depends on the
// DOM, and saving (or auto-saving) never touches it.

export interface Snapshot {
  value: string
  selectionStart: number
  selectionEnd: number
}

// How an edit happened, which decides whether it joins the one before it. Typing and deleting
// run together into a single step, like a word processor; everything else (paste, cut, Tab,
// Enter, dropping text) is a step of its own.
export type EditKind = "insert" | "delete" | "other"

export interface History {
  // Older states, oldest first. The last one is where Undo goes.
  past: Snapshot[]
  present: Snapshot
  // States Undo stepped back from, newest last. Any new edit empties it.
  future: Snapshot[]
  lastKind: EditKind
  lastAt: number
}

// A pause longer than this ends a typing run.
export const GROUP_MS = 1000
// The oldest steps are dropped past this, so a long session stays small.
export const MAX_STEPS = 200

export function createHistory(value: string): History {
  return {
    past: [],
    present: { value, selectionStart: value.length, selectionEnd: value.length },
    future: [],
    lastKind: "other",
    lastAt: 0,
  }
}

// Reads the kind of edit off a textarea's `inputType` ("insertText", "deleteContentBackward"…).
export function editKind(inputType: string | undefined): EditKind {
  if (!inputType) return "other"
  if (inputType === "insertText" || inputType === "insertCompositionText") return "insert"
  if (inputType === "deleteContentBackward" || inputType === "deleteContentForward") return "delete"
  return "other"
}

// Whether `next` carries on from `present`: the caret was where the last edit left it, so typing
// after clicking elsewhere starts a new step.
function continues(present: Snapshot, next: Snapshot) {
  // Where the caret was before a typed character or a Backspace: back by how much was added, or
  // forward by how much was removed. Delete removes ahead of the caret and leaves it in place.
  const caretBefore = next.selectionStart - (next.value.length - present.value.length)
  return caretBefore === present.selectionEnd || next.selectionStart === present.selectionEnd
}

// Adds the state after an edit. A change that keeps the text only moves the caret, which also
// ends the typing run: the next keystroke starts a new step.
export function record(history: History, next: Snapshot, kind: EditKind, now: number): History {
  const { present } = history
  if (next.value === present.value) {
    const moved =
      next.selectionStart !== present.selectionStart || next.selectionEnd !== present.selectionEnd
    return { ...history, present: next, lastKind: moved ? "other" : history.lastKind }
  }

  const joins =
    kind !== "other" &&
    kind === history.lastKind &&
    now - history.lastAt < GROUP_MS &&
    continues(present, next)

  // Joining keeps the step's starting state and replaces its end.
  const past = joins ? history.past : [...history.past, present].slice(-MAX_STEPS)
  return { past, present: next, future: [], lastKind: kind, lastAt: now }
}

export function canUndo(history: History) {
  return history.past.length > 0
}

export function canRedo(history: History) {
  return history.future.length > 0
}

// Steps back. The next edit starts a new step, whatever it is.
export function undo(history: History): History {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [...history.future, history.present],
    lastKind: "other",
    lastAt: 0,
  }
}

export function redo(history: History): History {
  const next = history.future.at(-1)
  if (!next) return history
  return {
    past: [...history.past, history.present].slice(-MAX_STEPS),
    present: next,
    future: history.future.slice(0, -1),
    lastKind: "other",
    lastAt: 0,
  }
}
