import { describe, expect, test } from "bun:test"
import { caretAfter, createHistory, type History, record, redo, undo } from "@/lib/undo-history"

// The editor's own undo stack.

// An undo that must have something to undo.
function back(history: History) {
  const result = undo(history)
  if (!result) throw new Error("nothing to undo")
  return result
}

function typed(history: History, values: string[], start = 1000, gap = 100) {
  return values.reduce(
    (current, value, index) => record(current, value, start + index * gap),
    history,
  )
}

describe("undo history", () => {
  test("typing in a burst is one undo step", () => {
    const history = typed(createHistory(""), ["h", "he", "hel", "hell", "hello"])
    expect(history.present).toBe("hello")
    expect(undo(history)?.present).toBe("")
  })

  test("a pause starts a new step", () => {
    let history = typed(createHistory(""), ["a", "ab"])
    history = record(history, "abc", 5000)
    expect(history.present).toBe("abc")
    expect(back(history).present).toBe("ab")
    expect(back(back(history)).present).toBe("")
  })

  test("a paste is its own step, even in the middle of typing", () => {
    let history = typed(createHistory(""), ["a", "ab"])
    history = record(history, "ab pasted text", 1300, true)
    history = record(history, "ab pasted text!", 1400)
    expect(undo(history)?.present).toBe("ab pasted text")
    expect(back(back(history)).present).toBe("ab")
  })

  test("a big change is not merged into typing", () => {
    let history = typed(createHistory(""), ["a", "ab"])
    history = record(history, "abcdefgh", 1300)
    expect(undo(history)?.present).toBe("ab")
  })

  test("redo walks forward and a new edit clears it", () => {
    const history = typed(createHistory("start"), ["start1"])
    const earlier = back(history)
    expect(earlier.present).toBe("start")
    expect(redo(earlier)?.present).toBe("start1")
    expect(redo(record(earlier, "other", 9000))).toBeNull()
  })

  test("nothing to undo or redo at the ends", () => {
    expect(undo(createHistory("x"))).toBeNull()
    expect(redo(createHistory("x"))).toBeNull()
  })

  test("recording the same text changes nothing", () => {
    const history = createHistory("same")
    expect(record(history, "same", 10)).toBe(history)
  })

  test("it keeps the last 200 steps", () => {
    let history = createHistory("")
    for (let index = 1; index <= 250; index += 1) {
      history = record(history, "x".repeat(index), index * 10_000)
    }
    expect(history.past.length).toBe(200)
  })
})

describe("caret after a step", () => {
  test("lands at the end of the change", () => {
    expect(caretAfter("hello world", "hello brave world")).toBe("hello brave ".length)
    expect(caretAfter("hello brave world", "hello world")).toBe("hello ".length)
  })

  test("handles a change at either end and no change", () => {
    expect(caretAfter("", "abc")).toBe(3)
    expect(caretAfter("abc", "")).toBe(0)
    expect(caretAfter("abc", "abc")).toBe(3)
    expect(caretAfter("aaa", "aa")).toBe(2)
  })
})
