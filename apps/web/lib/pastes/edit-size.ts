// Auto-save folds edits close together into one revision. An edit that rewrites most of a paste is
// worth its own entry in the history, so this measures how much one save changed.
export const LARGE_EDIT_SHARE = 0.5
export const LARGE_EDIT_MIN_CHARS = 300

type Text = { name: string; content: string }

// Lines by file, with how many times each appears and what one occurrence weighs.
function lineWeights(files: Text[]) {
  const lines = new Map<string, { count: number; weight: number }>()
  let total = 0
  for (const file of files) {
    for (const line of file.content.split("\n")) {
      const key = `${file.name}\u0000${line}`
      const weight = line.length + 1
      const entry = lines.get(key)
      if (entry) entry.count += 1
      else lines.set(key, { count: 1, weight })
      total += weight
    }
  }
  return { lines, total }
}

// True when at least half of the lines across both versions are not in the other one, and that is
// more than a few words. Moving a line is cheap, so only lines that really appear or disappear count.
export function isLargeEdit(before: Text[], after: Text[]): boolean {
  const old = lineWeights(before)
  const next = lineWeights(after)

  let changed = 0
  for (const [key, { count, weight }] of old.lines) {
    changed += Math.abs(count - (next.lines.get(key)?.count ?? 0)) * weight
  }
  for (const [key, { count, weight }] of next.lines) {
    if (!old.lines.has(key)) changed += count * weight
  }

  const total = old.total + next.total
  return changed >= LARGE_EDIT_MIN_CHARS && total > 0 && changed / total >= LARGE_EDIT_SHARE
}
