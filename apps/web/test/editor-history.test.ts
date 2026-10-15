import { describe, expect, test } from "bun:test"
import {
  canRedo,
  canUndo,
  createHistory,
  editKind,
  GROUP_MS,
  type History,
  MAX_STEPS,
  record,
  redo,
  type Snapshot,
  undo,
} from "@/lib/editor-history"

// The editor's own undo stack: how edits group into steps, and that undo/redo walk them.

const at = (value: string, caret = value.length): Snapshot => ({
  value,
  selectionStart: caret,
  selectionEnd: caret,
})

// Types `text` one character at a time, `gap` ms apart, from the end of the current value.
function type(history: History, text: string, start = 1000, gap = 50) {
  let current = history
  let value = history.present.value
  let now = start
  for (const char of text) {
    value += char
    current = record(current, at(value), "insert", now)
    now += gap
  }
  return current
}

describe("editor history", () => {
  test("typing in one go is a single step", () => {
    const history = type(createHistory(""), "hello")
    expect(history.present.value).toBe("hello")
    expect(history.past).toHaveLength(1)
    const back = undo(history)
    expect(back.present.value).toBe("")
    expect(canUndo(back)).toBe(false)
    expect(canRedo(back)).toBe(true)
  })

  test("a pause starts a new step", () => {
    let history = type(createHistory(""), "one", 1000)
    history = type(history, " two", 1000 + GROUP_MS * 2)
    expect(history.present.value).toBe("one two")
    expect(undo(history).present.value).toBe("one")
    expect(undo(undo(history)).present.value).toBe("")
  })

  test("moving the caret before typing starts a new step", () => {
    let history = type(createHistory(""), "abc")
    // Click to the start, then type "X" right away.
    history = record(history, { value: "Xabc", selectionStart: 1, selectionEnd: 1 }, "insert", 1300)
    expect(history.past).toHaveLength(2)
    expect(undo(history).present.value).toBe("abc")
  })

  test("clicking elsewhere ends the run even when typing resumes at once", () => {
    let history = type(createHistory(""), "abc")
    history = record(history, at("abc", 1), "other", 1200)
    history = record(history, { value: "aXbc", selectionStart: 2, selectionEnd: 2 }, "insert", 1250)
    expect(undo(history).present.value).toBe("abc")
  })

  test("typing and deleting are separate steps, and Backspace runs group", () => {
    let history = type(createHistory(""), "abcd")
    history = record(history, at("abc"), "delete", 1300)
    history = record(history, at("ab"), "delete", 1350)
    expect(history.present.value).toBe("ab")
    expect(undo(history).present.value).toBe("abcd")
    expect(undo(undo(history)).present.value).toBe("")
  })

  test("Delete in place runs group too", () => {
    let history = type(createHistory(""), "abcd")
    history = record(history, { value: "abcd", selectionStart: 0, selectionEnd: 0 }, "other", 1300)
    history = record(history, { value: "bcd", selectionStart: 0, selectionEnd: 0 }, "delete", 1400)
    history = record(history, { value: "cd", selectionStart: 0, selectionEnd: 0 }, "delete", 1450)
    expect(history.past).toHaveLength(2)
    expect(undo(history).present.value).toBe("abcd")
  })

  test("paste, cut and indent are steps of their own", () => {
    let history = type(createHistory(""), "ab")
    history = record(history, at("abPASTE"), "other", 1200)
    history = record(history, at("abPASTE  "), "other", 1250)
    expect(undo(history).present.value).toBe("abPASTE")
    expect(undo(undo(history)).present.value).toBe("ab")
  })

  test("undo restores the caret and redo goes forward again", () => {
    let history = createHistory("hello")
    history = record(history, { value: "hello!", selectionStart: 6, selectionEnd: 6 }, "other", 1)
    const back = undo(history)
    expect(back.present).toEqual({ value: "hello", selectionStart: 5, selectionEnd: 5 })
    expect(redo(back).present).toEqual({ value: "hello!", selectionStart: 6, selectionEnd: 6 })
    expect(redo(redo(back))).toEqual(redo(back))
  })

  test("a new edit after undo drops the redo steps", () => {
    let history = type(createHistory(""), "abc")
    history = undo(history)
    history = record(history, at("z"), "insert", 5000)
    expect(canRedo(history)).toBe(false)
    expect(undo(history).present.value).toBe("")
  })

  test("the first edit after undo or redo never joins the step it undid", () => {
    let history = type(createHistory(""), "ab")
    history = undo(history)
    history = redo(history)
    history = record(history, at("abc"), "insert", 1200)
    expect(undo(history).present.value).toBe("ab")
  })

  test("a change that keeps the text only moves the caret", () => {
    const history = type(createHistory(""), "abc")
    const moved = record(history, at("abc", 1), "other", 3000)
    expect(moved.past).toEqual(history.past)
    expect(moved.present.selectionStart).toBe(1)
  })

  test("history is capped", () => {
    let history = createHistory("")
    for (let step = 1; step <= MAX_STEPS + 50; step++) {
      history = record(history, at("x".repeat(step)), "other", step)
    }
    expect(history.past).toHaveLength(MAX_STEPS)
  })

  test("reads the kind of edit from inputType", () => {
    expect(editKind("insertText")).toBe("insert")
    expect(editKind("insertCompositionText")).toBe("insert")
    expect(editKind("deleteContentBackward")).toBe("delete")
    expect(editKind("deleteContentForward")).toBe("delete")
    expect(editKind("insertFromPaste")).toBe("other")
    expect(editKind("deleteByCut")).toBe("other")
    expect(editKind("insertLineBreak")).toBe("other")
    expect(editKind(undefined)).toBe("other")
  })
})
