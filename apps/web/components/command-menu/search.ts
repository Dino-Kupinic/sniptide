// Which results the command menu shows. "all" is the default; the chips on mobile pick one scope,
// and a leading `>` in the field does the same for commands on desktop.
export type Scope = "all" | "pastes" | "collections" | "commands"

export const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pastes", label: "Pastes" },
  { id: "collections", label: "Collections" },
  { id: "commands", label: "Commands" },
]

// The scope a typed value implies and the text to search for: `>` limits results to commands.
export function parseQuery(value: string, chip: Scope): { scope: Scope; text: string } {
  if (value.startsWith(">")) return { scope: "commands", text: value.slice(1).trim() }
  return { scope: chip, text: value.trim() }
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
