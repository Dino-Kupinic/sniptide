import { expect, test } from "bun:test"
import { diffLines } from "../lib/pastes/revision-diff"

test("keeps unchanged lines and identifies insertions and removals", () => {
  expect(diffLines("one\ntwo\nthree", "one\nnew\nthree")).toEqual([
    { kind: "same", text: "one" },
    { kind: "removed", text: "two" },
    { kind: "added", text: "new" },
    { kind: "same", text: "three" },
  ])
})
test("handles added and removed files, empty content, and trailing newlines", () => {
  for (const [a, b] of [
    ["", "added\n"],
    ["removed", ""],
    ["", ""],
    ["a\n", "a"],
    ["x\nx", "x"],
  ] as const) {
    const diff = diffLines(a, b)
    expect(
      diff
        .filter((l) => l.kind !== "added")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(a)
    expect(
      diff
        .filter((l) => l.kind !== "removed")
        .map((l) => l.text)
        .join("\n"),
    ).toBe(b)
  }
})
test("bounds work for large files without losing content", () => {
  const a = "old\n".repeat(600),
    b = "new\n".repeat(600)
  const diff = diffLines(a, b)
  expect(
    diff
      .filter((l) => l.kind !== "added")
      .map((l) => l.text)
      .join("\n"),
  ).toBe(a)
  expect(
    diff
      .filter((l) => l.kind !== "removed")
      .map((l) => l.text)
      .join("\n"),
  ).toBe(b)
})
