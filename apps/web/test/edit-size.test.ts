import { describe, expect, test } from "bun:test"
import { isLargeEdit } from "@/lib/pastes/edit-size"

const lines = (word: string, count = 40) =>
  Array.from({ length: count }, (_, index) => `${word} line number ${index}`).join("\n")
const file = (content: string, name = "a.txt") => ({ name, content })

describe("isLargeEdit", () => {
  test("typing and small fixes are not large", () => {
    const before = [file(lines("old"))]
    expect(isLargeEdit(before, [file(`${lines("old")}\nmore`)])).toBe(false)
    expect(isLargeEdit(before, [file(lines("old").replace("number 3", "no. 3"))])).toBe(false)
    expect(isLargeEdit(before, before)).toBe(false)
  })

  test("replacing most of the text is large", () => {
    expect(isLargeEdit([file(lines("old"))], [file(lines("new"))])).toBe(true)
    expect(isLargeEdit([file(lines("old"))], [file("")])).toBe(true)
  })

  test("replacing half of the lines is large, a fifth is not", () => {
    const old = Array.from({ length: 40 }, (_, index) => `line ${index} of the old text`)
    const swap = (count: number) =>
      [...old.slice(0, 40 - count), ...old.slice(40 - count).map((line) => `new ${line}`)].join(
        "\n",
      )
    expect(isLargeEdit([file(old.join("\n"))], [file(swap(20))])).toBe(true)
    expect(isLargeEdit([file(old.join("\n"))], [file(swap(8))])).toBe(false)
  })

  test("a short paste never counts, however much changes", () => {
    expect(isLargeEdit([file("hello")], [file("goodbye")])).toBe(false)
  })

  test("adding a file next to the others is not a rewrite, swapping one out is", () => {
    const one = [file(lines("a"))]
    expect(isLargeEdit(one, [...one, file(lines("b"), "b.txt")])).toBe(false)
    expect(isLargeEdit(one, [file(lines("a"), "renamed.txt")])).toBe(true)
  })

  test("moving lines around is not a rewrite", () => {
    const old = lines("old").split("\n")
    expect(isLargeEdit([file(old.join("\n"))], [file([...old].reverse().join("\n"))])).toBe(false)
  })
})
