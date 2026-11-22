import { describe, expect, test } from "bun:test"
import { highlight, highlightWords, matches, parseQuery } from "@/components/command-menu/search"

// What the ⌘K menu does with the text before it asks for results.

describe("command menu query", () => {
  test("a leading > limits the menu to commands", () => {
    expect(parseQuery(">  new")).toEqual({ scope: "commands", text: "new" })
    expect(parseQuery(">")).toEqual({ scope: "commands", text: "" })
  })

  test("otherwise everything is searched and the text is trimmed", () => {
    expect(parseQuery("  api ")).toEqual({ scope: "all", text: "api" })
    // A > that isn't first is just a character.
    expect(parseQuery("a > b")).toEqual({ scope: "all", text: "a > b" })
  })

  test("matching ignores case and an empty query matches everything", () => {
    expect(matches("Toggle theme", "THEME")).toBe(true)
    expect(matches("Toggle theme", "paste")).toBe(false)
    expect(matches("Toggle theme", "")).toBe(true)
  })

  test("highlight marks every occurrence and keeps the original casing", () => {
    expect(highlight("API rate api", "api")).toEqual([
      { text: "API", match: true },
      { text: " rate ", match: false },
      { text: "api", match: true },
    ])
    expect(highlight("openapi.yaml", "api")).toEqual([
      { text: "open", match: false },
      { text: "api", match: true },
      { text: ".yaml", match: false },
    ])
    expect(highlight("deployment", "")).toEqual([{ text: "deployment", match: false }])
    expect(highlight("deployment", "zzz")).toEqual([{ text: "deployment", match: false }])
  })

  test("highlight treats the query literally, not as a pattern", () => {
    expect(highlight("a.b (c)", ".b (")).toEqual([
      { text: "a", match: false },
      { text: ".b (", match: true },
      { text: "c)", match: false },
    ])
  })
})

test("highlightWords marks each word of the query on its own", () => {
  expect(highlightWords("retryFetch with backoff", "backoff  RETRY")).toEqual([
    { text: "retry", match: true },
    { text: "Fetch with ", match: false },
    { text: "backoff", match: true },
  ])
  expect(highlightWords("aaa", "aa")).toEqual([{ text: "aaa", match: true }])
  expect(highlightWords("plain", "")).toEqual([{ text: "plain", match: false }])
})
