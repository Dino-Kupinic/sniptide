import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HighlightedTextarea } from "@/components/paste/highlighted-textarea"
import {
  EDITOR_MAX_LENGTH,
  EDITOR_MAX_LINES,
  editorLineCount,
  isLargeEditorContent,
} from "@/lib/highlight/editor-limits"

describe("editor plain fallback", () => {
  test("keeps empty and trailing lines in the count", () => {
    expect(editorLineCount("")).toBe(1)
    expect(editorLineCount("one\ntwo\n")).toBe(3)
    expect(editorLineCount("\n\n\n", 1)).toBe(2)
  })

  test("uses the same exact size and line boundaries as live highlighting", () => {
    expect(isLargeEditorContent("a".repeat(EDITOR_MAX_LENGTH))).toBe(false)
    expect(isLargeEditorContent("a".repeat(EDITOR_MAX_LENGTH + 1))).toBe(true)
    expect(isLargeEditorContent("\n".repeat(EDITOR_MAX_LINES - 1))).toBe(false)
    expect(isLargeEditorContent("\n".repeat(EDITOR_MAX_LINES))).toBe(true)
  })

  test("oversized files preserve visible text without a DOM element for every line", () => {
    const value = "line\n".repeat(20_000)
    const markup = renderToStaticMarkup(
      createElement(HighlightedTextarea, { value, onChange: () => {}, rows: 12 }),
    )
    expect(markup.match(/<div\b/g)).toHaveLength(1)
    expect(markup).toContain("text-foreground")
    expect(markup).not.toContain("text-transparent")
    expect(markup).toContain(value)
    expect(markup).toContain('rows="12"')
  })

  test("ordinary text keeps the color overlay and native textarea", () => {
    const markup = renderToStaticMarkup(
      createElement(HighlightedTextarea, { value: "one\ntwo", onChange: () => {} }),
    )
    expect(markup).toContain("text-transparent")
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain("one\ntwo</textarea>")
  })
})
