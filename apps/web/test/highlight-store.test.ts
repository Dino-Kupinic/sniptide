import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { highlightCache } from "@workspace/db/schema"
import { getDb } from "@/lib/db"
import { highlightFiles, packRuns, unpackRuns } from "@/lib/highlight/highlight"
import type { HighlightedLines } from "@/lib/highlight/types"
import { telemetrySnapshot } from "@/lib/telemetry"
import { hasDatabase } from "./harness"

const describeDb = hasDatabase ? describe : describe.skip
const lines: HighlightedLines = [
  [["const", "keyword"], " answer = ", ["42", "constant"]],
  [],
  [["// naïve ✓", "comment"]],
]

describe("stored highlight runs", () => {
  test("hold lengths and colours, and rebuild the tokens from the code", () => {
    const code = "const answer = 42\r\n\n// naïve ✓"
    const runs = packRuns(lines)
    expect(JSON.stringify(runs)).not.toContain("answer")
    expect(runs).toEqual([[5, 1, 10, 0, 2, 3], [], [10, 7]])
    expect(unpackRuns(code, runs)).toEqual(lines)
  })

  test("are refused when they don't fit the code", () => {
    const runs = packRuns(lines)
    expect(unpackRuns("const answer = 4\n\n// naïve ✓", runs)).toBeNull()
    expect(unpackRuns("const answer = 42\n// naïve ✓", runs)).toBeNull()
    expect(unpackRuns("const answer = 42\n\n// naïve ✓", [[5, 99, 12, 0], [], [10, 7]])).toBeNull()
    expect(unpackRuns("const answer = 42\n\n// naïve ✓", [[5, 1], [], [10, 7]])).toBeNull()
  })
})

describeDb("highlight store", () => {
  const capacity = process.env.HIGHLIGHT_CACHE_BYTES
  // With no room in memory every call has to go to the database or tokenize again.
  beforeEach(async () => {
    process.env.HIGHLIGHT_CACHE_BYTES = "0"
    await getDb().delete(highlightCache)
  })
  afterAll(async () => {
    if (capacity === undefined) delete process.env.HIGHLIGHT_CACHE_BYTES
    else process.env.HIGHLIGHT_CACHE_BYTES = capacity
    await getDb().delete(highlightCache)
  })
  const file = (content: string) => ({ name: "a.ts", language: "typescript", content })
  const stored = () => telemetrySnapshot().metrics["highlight:stored"]?.count ?? 0
  const big = `${"export const secretName = 'value'\n".repeat(80)}`

  test("keeps larger files without their text and reuses them", async () => {
    const [first] = await highlightFiles([file(big)])
    const rows = await getDb().select().from(highlightCache)
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain("secretName")

    const before = stored()
    const [second] = await highlightFiles([file(big)])
    expect(stored()).toBe(before + 1)
    expect(second?.lines).toEqual(first?.lines)
  })

  test("skips small files and tokenizes again over a damaged row", async () => {
    await highlightFiles([file("export const small = 1\n")])
    expect(await getDb().select().from(highlightCache)).toHaveLength(0)

    const [first] = await highlightFiles([file(big)])
    await getDb()
      .update(highlightCache)
      .set({ runs: [[1, 0]] })
    const before = stored()
    const [again] = await highlightFiles([file(big)])
    expect(stored()).toBe(before)
    expect(again?.lines).toEqual(first?.lines)
    const [row] = await getDb().select().from(highlightCache)
    expect(row?.runs.length).toBeGreaterThan(1)
  })
})
