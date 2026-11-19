export type DiffLine = { kind: "same" | "added" | "removed"; text: string }

// Bound memory and work for large pastes; those still get a complete replacement diff.
export function diffLines(before: string, after: string): DiffLine[] {
  if (before === after) return before.split("\n").map((text) => ({ kind: "same", text }))
  const a = before === "" ? [] : before.split("\n")
  const b = after === "" ? [] : after.split("\n")
  const lines: DiffLine[] = []
  let i = 0,
    j = 0

  if (a.length * b.length <= 250000) {
    while (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i++] ?? "" })
      j++
    }
    if (i < a.length && j < b.length) {
      const start = i
      const stride = b.length - start + 1
      // The longest common subsequence fits in 500 lines under the cell budget.
      const scores = new Uint16Array((a.length - start + 1) * stride)
      for (let row = a.length - 1; row >= start; row--) {
        const offset = (row - start) * stride
        for (let col = b.length - 1; col >= start; col--) {
          const cell = offset + col - start
          scores[cell] =
            a[row] === b[col]
              ? 1 + (scores[cell + stride + 1] ?? 0)
              : Math.max(scores[cell + stride] ?? 0, scores[cell + 1] ?? 0)
        }
      }
      while (i < a.length && j < b.length) {
        const cell = (i - start) * stride + j - start
        if (a[i] === b[j]) {
          lines.push({ kind: "same", text: a[i++] ?? "" })
          j++
        } else if ((scores[cell + stride] ?? 0) >= (scores[cell + 1] ?? 0)) {
          lines.push({ kind: "removed", text: a[i++] ?? "" })
        } else lines.push({ kind: "added", text: b[j++] ?? "" })
      }
    }
  }
  while (i < a.length) lines.push({ kind: "removed", text: a[i++] ?? "" })
  while (j < b.length) lines.push({ kind: "added", text: b[j++] ?? "" })
  return lines
}
