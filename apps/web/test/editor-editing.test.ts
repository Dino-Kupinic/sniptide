import { describe, expect, test } from "bun:test"
import { editorEdit } from "@/lib/editor-editing"
import { createHistory, record, redo, type Snapshot, undo } from "@/lib/editor-history"

function at(value: string, selectionStart = value.length, selectionEnd = selectionStart): Snapshot {
  return { value, selectionStart, selectionEnd }
}

function edit(...args: Parameters<typeof editorEdit>): Snapshot {
  const next = editorEdit(...args)
  if (!next) throw new Error("Expected an editor edit")
  return next
}

describe("editor indentation", () => {
  test.each(["  ", "    ", "\t"])("indents selected lines without deleting code (%j)", (unit) => {
    const before = at("one\ntwo\nthree", 1, 6)
    const next = edit(before, "Tab", unit)
    expect(next).toEqual(at(`${unit}one\n${unit}two\nthree`, 1 + unit.length, 6 + 2 * unit.length))
    expect(editorEdit(next, "Tab", unit, true)).toEqual(before)
  })

  test("repeated Tab keeps the selected lines selected", () => {
    const before = at("one\ntwo", 0, 7)
    const once = edit(before, "Tab", "  ")
    const twice = edit(once, "Tab", "  ")
    expect(twice).toEqual(at("    one\n    two", 4, 15))
    expect(editorEdit(twice, "Tab", "  ", true)).toEqual(once)
  })

  test("a selection ending at a line start leaves that line alone", () => {
    expect(editorEdit(at("one\ntwo\nthree", 0, 4), "Tab", "  ")).toEqual(
      at("  one\ntwo\nthree", 2, 6),
    )
  })

  test("a partial single-line selection indents the whole line", () => {
    expect(editorEdit(at("before\nhello\nafter", 8, 10), "Tab", "  ")).toEqual(
      at("before\n  hello\nafter", 10, 12),
    )
  })

  test("blank first and last lines can be selected and indented", () => {
    expect(editorEdit(at("\none\n", 0, 5), "Tab", "  ")).toEqual(at("  \n  one\n", 2, 9))
    expect(editorEdit(at("\n", 0, 0), "Tab", "  ", true)).toEqual(at("\n", 0))
  })

  test("Tab at the caret inserts the configured indentation", () => {
    expect(editorEdit(at("ab", 1), "Tab", "    ")).toEqual(at("a    b", 5))
    expect(editorEdit(at("", 0), "Tab", "\t")).toEqual(at("\t", 1))
  })

  test("Shift+Tab removes partial indentation, tabs, and leaves unindented text", () => {
    expect(editorEdit(at(" a\n\tb\nc", 0, 7), "Tab", "  ", true)).toEqual(at("a\nb\nc", 0, 5))
    expect(editorEdit(at("    abc", 6), "Tab", "  ", true)).toEqual(at("  abc", 4))
    expect(editorEdit(at("abc", 0, 3), "Tab", "  ", true)).toEqual(at("abc", 0, 3))
    expect(editorEdit(at("  abc", 1, 4), "Tab", "    ", true)).toEqual(at("abc", 0, 2))
  })

  test("backward selections retain their direction", () => {
    const before = { ...at("a\nb", 0, 3), selectionDirection: "backward" as const }
    expect(editorEdit(before, "Tab", "  ")).toEqual({
      ...at("  a\n  b", 2, 7),
      selectionDirection: "backward",
    })
  })
})

describe("editor pairs", () => {
  test.each([
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ])("pairs %s%s and places the caret inside", (open, close) => {
    const paired = edit(at(""), open, "  ")
    expect(paired).toEqual(at(open + close, 1))
    expect(editorEdit(paired, close, "  ")).toEqual(at(open + close, 2))
    expect(editorEdit(paired, "Backspace", "  ")).toEqual(at(""))
  })

  test("typing two opening braces creates nested matching braces", () => {
    const first = edit(at(""), "{", "  ")
    const second = edit(first, "{", "  ")
    expect(second).toEqual(at("{{}}", 2))
    expect(editorEdit(edit(second, "}", "  "), "}", "  ")).toEqual(at("{{}}", 4))
  })

  test("wraps selected text and leaves it selected", () => {
    expect(editorEdit(at("let answer = value", 13, 18), "(", "  ")).toEqual(
      at("let answer = (value)", 14, 19),
    )
    expect(editorEdit(at("a\nb", 0, 3), "{", "  ")).toEqual(at("{a\nb}", 1, 4))
  })

  test("does not duplicate closers or consume selected closing characters", () => {
    expect(editorEdit(at("call()", 5), ")", "  ")).toEqual(at("call()", 6))
    expect(editorEdit(at("()", 1, 2), ")", "  ")).toBeNull()
  })

  test("leaves apostrophes, escaped quotes, and typing before words to the browser", () => {
    expect(editorEdit(at("don"), "'", "  ")).toBeNull()
    expect(editorEdit(at('"hello\\"', 7), '"', "  ")).toBeNull()
    expect(editorEdit(at("value", 0), "(", "  ")).toBeNull()
    expect(editorEdit(at("\\"), '"', "  ")).toBeNull()
    expect(editorEdit(at("\\\\"), '"', "  ")).toEqual(at('\\\\""', 3))
  })

  test("ordinary keys and ordinary deletions stay native", () => {
    expect(editorEdit(at("abc"), "x", "  ")).toBeNull()
    expect(editorEdit(at("abc"), "Backspace", "  ")).toBeNull()
    expect(editorEdit(at(""), "Backspace", "  ")).toBeNull()
    expect(editorEdit(at("(x)", 2), "Backspace", "  ")).toBeNull()
  })
})

describe("editor line breaks and history", () => {
  test.each(["  ", "    ", "\t"])("Enter opens an indented block with %j", (unit) => {
    expect(editorEdit(at("{}", 1), "Enter", unit)).toEqual(at(`{\n${unit}\n}`, 2 + unit.length))
    expect(editorEdit(at(`${unit}[]`, unit.length + 1), "Enter", unit)).toEqual(
      at(`${unit}[\n${unit}${unit}\n${unit}]`, 2 + 3 * unit.length),
    )
  })

  test("Enter retains existing indentation and indents after open brackets", () => {
    expect(editorEdit(at("  hello world", 7), "Enter", "  ")).toEqual(at("  hello\n   world", 10))
    expect(editorEdit(at("  if (ready) {"), "Enter", "  ")).toEqual(at("  if (ready) {\n    "))
    expect(editorEdit(at("hello", 0), "Enter", "  ")).toEqual(at("\nhello", 1))
  })

  test("Enter replaces only the selection", () => {
    expect(editorEdit(at("  one two", 5, 9), "Enter", "  ")).toEqual(at("  one\n  "))
  })

  test("Enter on a blank line retains its indentation without opening another block", () => {
    expect(editorEdit(at("{\n  "), "Enter", "  ")).toEqual(at("{\n  \n  "))
  })

  test("Backspace removes indentation to the previous stop", () => {
    expect(editorEdit(at("     text", 5), "Backspace", "    ")).toEqual(at("    text", 4))
    expect(editorEdit(at("    text", 4), "Backspace", "    ")).toEqual(at("text", 0))
    expect(editorEdit(at("\ttext", 1), "Backspace", "\t")).toBeNull()
  })

  test("undo and redo restore text and selection for each automatic edit", () => {
    const initial = at("one\ntwo", 0, 7)
    let history = record(createHistory(initial.value), initial, "other", 1)
    const indented = edit(initial, "Tab", "  ")
    history = record(history, indented, "other", 2)
    expect(undo(history).present).toEqual(initial)
    expect(redo(undo(history)).present).toEqual(indented)
    const wrapped = edit(indented, "{", "  ")
    history = record(history, wrapped, "other", 3)
    expect(undo(history).present).toEqual(indented)
    expect(undo(undo(history)).present).toEqual(initial)
  })
})
