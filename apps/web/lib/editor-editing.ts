import type { Snapshot } from "./editor-history"

const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")", '"': '"', "'": "'", "`": "`" }

function replaceSelection(current: Snapshot, text: string, caret = text.length): Snapshot {
  const { value, selectionStart, selectionEnd } = current
  return {
    ...current,
    value: value.slice(0, selectionStart) + text + value.slice(selectionEnd),
    selectionStart: selectionStart + caret,
    selectionEnd: selectionStart + caret,
  }
}

function indentLines(current: Snapshot, unit: string, outdent: boolean): Snapshot {
  const { value, selectionStart, selectionEnd } = current
  const start = value.slice(0, selectionStart).lastIndexOf("\n") + 1
  // A selection ending at the next line's start doesn't include that line.
  const last =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd
  const end = value.indexOf("\n", last)
  const edits: { at: number; removed: number; inserted: string }[] = []
  let at = start
  const lines = value.slice(start, end < 0 ? value.length : end).split("\n")
  const changed = lines.map((line) => {
    const removed = outdent
      ? line.startsWith("\t")
        ? 1
        : Math.min(unit.length, line.match(/^ */)?.[0].length ?? 0)
      : 0
    edits.push({ at, removed, inserted: outdent ? "" : unit })
    at += line.length + 1
    return outdent ? line.slice(removed) : unit + line
  })
  function map(position: number) {
    let next = position
    for (const edit of edits) {
      if (edit.at > position) break
      next += edit.inserted.length - Math.min(edit.removed, position - edit.at)
    }
    return next
  }
  const next = value.slice(0, start) + changed.join("\n") + (end < 0 ? "" : value.slice(end))
  return {
    ...current,
    value: next,
    selectionStart: map(selectionStart),
    selectionEnd: map(selectionEnd),
  }
}

function escaped(value: string, at: number) {
  let slashes = 0
  while (at > 0 && value[--at] === "\\") slashes++
  return slashes % 2 === 1
}

// Null leaves the key to the browser. The caller filters shortcuts and composition first.
export function editorEdit(
  current: Snapshot,
  key: string,
  unit: string,
  shift = false,
): Snapshot | null {
  const { value, selectionStart: start, selectionEnd: end } = current
  const selected = start !== end
  const before = value.slice(0, start)
  const after = value.slice(end)

  if (key === "Tab") {
    return shift || selected ? indentLines(current, unit, shift) : replaceSelection(current, unit)
  }

  if (key === "Enter") {
    const line = before.slice(before.lastIndexOf("\n") + 1)
    const indentation = line.match(/^[\t ]*/)?.[0] ?? ""
    const opening = line.trimEnd().at(-1) ?? ""
    const closer = ["{", "[", "("].includes(opening) ? pairs[opening] : undefined
    const inner = indentation + (closer ? unit : "")
    const text = `\n${inner}${closer && after.startsWith(closer) ? `\n${indentation}` : ""}`
    return replaceSelection(current, text, 1 + inner.length)
  }

  if (key === "Backspace" && !selected) {
    const opening = before.at(-1) ?? ""
    if (pairs[opening] && pairs[opening] === after[0] && !escaped(value, start - 1)) {
      return replaceSelection({ ...current, selectionStart: start - 1, selectionEnd: end + 1 }, "")
    }
    const line = before.slice(before.lastIndexOf("\n") + 1)
    if (unit !== "\t" && /^ +$/.test(line)) {
      const count = line.length % unit.length || unit.length
      return replaceSelection({ ...current, selectionStart: start - count }, "")
    }
  }

  const quote = ["'", '"', "`"].includes(key)
  if (
    !selected &&
    ["}", "]", ")", "'", '"', "`"].includes(key) &&
    after[0] === key &&
    !escaped(value, start)
  ) {
    return { ...current, selectionStart: start + 1, selectionEnd: start + 1 }
  }
  const closing = pairs[key]
  if (!closing) return null
  if (selected) {
    const next = replaceSelection(current, key + value.slice(start, end) + closing)
    return { ...next, selectionStart: start + 1, selectionEnd: end + 1 }
  }
  // Don't pair apostrophes in words, escaped quotes, or openers before existing text.
  if (quote && (escaped(value, start) || /[\p{L}\p{N}_]/u.test(before.at(-1) ?? ""))) return null
  if (after && !/^[\s\]})>,;:]/.test(after)) return null
  return replaceSelection(current, key + closing, 1)
}
