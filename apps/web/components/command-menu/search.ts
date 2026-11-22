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

// Splits `value` around every case-insensitive occurrence of any word of `text`. Paste results
// match each word anywhere in the paste, so each word is marked on its own.
export function highlightWords(value: string, text: string): Segment[] {
  const words = [...new Set(text.toLowerCase().split(/\s+/).filter(Boolean))]
  const haystack = value.toLowerCase()
  const marked = new Array<boolean>(value.length).fill(false)
  for (const word of words) {
    for (let at = haystack.indexOf(word); at !== -1; at = haystack.indexOf(word, at + 1)) {
      marked.fill(true, at, at + word.length)
    }
  }
  const segments: Segment[] = []
  for (let from = 0; from < value.length; ) {
    let to = from + 1
    while (to < value.length && marked[to] === marked[from]) to++
    segments.push({ text: value.slice(from, to), match: marked[from] ?? false })
    from = to
  }
  return segments.length > 0 ? segments : [{ text: value, match: false }]
}
