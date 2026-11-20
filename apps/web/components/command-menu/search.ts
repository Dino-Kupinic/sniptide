// Which results the command menu shows: everything by default, or only commands after a leading
// `>` in the field.
export type Scope = "all" | "commands"

// The scope a typed value implies and the text to search for.
export function parseQuery(value: string): { scope: Scope; text: string } {
  if (value.startsWith(">")) return { scope: "commands", text: value.slice(1).trim() }
  return { scope: "all", text: value.trim() }
}

export function matches(label: string, text: string) {
  return !text || label.toLowerCase().includes(text.toLowerCase())
}

export interface Segment {
  text: string
  match: boolean
}

// Splits `value` around every case-insensitive occurrence of `text`, for highlighting.
export function highlight(value: string, text: string): Segment[] {
  if (!text) return [{ text: value, match: false }]
  const segments: Segment[] = []
  const haystack = value.toLowerCase()
  const needle = text.toLowerCase()
  let from = 0
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) segments.push({ text: value.slice(from, at), match: false })
    segments.push({ text: value.slice(at, at + needle.length), match: true })
    from = at + needle.length
  }
  if (from < value.length) segments.push({ text: value.slice(from), match: false })
  return segments
}
