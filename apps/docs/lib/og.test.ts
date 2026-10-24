import { describe, expect, test } from "bun:test"
import { clip } from "./og"

describe("description clipping", () => {
  test("leaves a short description alone", () => {
    expect(clip("Short.")).toBe("Short.")
  })

  test("cuts a long one at a word", () => {
    const text = "word ".repeat(60).trim()
    const clipped = clip(text, 50)
    expect(clipped.length).toBeLessThanOrEqual(51)
    expect(clipped.endsWith("word…")).toBe(true)
  })
})
