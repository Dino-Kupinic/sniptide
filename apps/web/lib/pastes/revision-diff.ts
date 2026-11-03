export type DiffLine = { kind: "same" | "added" | "removed"; text: string }

// Bound memory and work for large pastes; those still get a complete replacement diff.
export function diffLines(before: string, after: string): DiffLine[] {
  if (before === after) return before.split("\n").map((text) => ({ kind: "same", text }))
  const a = before === "" ? [] : before.split("\n")
  const b = after === "" ? [] : after.split("\n")
  if (a.length * b.length > 250000)
    return [
      ...a.map((text): DiffLine => ({ kind: "removed", text })),
      ...b.map((text): DiffLine => ({ kind: "added", text })),
    ]
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  const score = (i: number, j: number) => table[i]?.[j] ?? 0
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) {
      const row = table[i]
      if (!row) continue
      row[j] = a[i] === b[j] ? 1 + score(i + 1, j + 1) : Math.max(score(i + 1, j), score(i, j + 1))
    }
  const lines: DiffLine[] = []
  let i = 0,
    j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i++] ?? "" })
      j++
    } else if (i < a.length && (j === b.length || score(i + 1, j) >= score(i, j + 1))) {
      lines.push({ kind: "removed", text: a[i++] ?? "" })
    } else lines.push({ kind: "added", text: b[j++] ?? "" })
  }
  return lines
}
