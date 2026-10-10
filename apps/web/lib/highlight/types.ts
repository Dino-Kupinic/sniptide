// What the highlighter hands to the code views. Plain JSON so a server page can pass it to the
// client-side file viewer.

// Colour groups; the code views map each to a --syntax-* variable (see packages/ui globals.css).
export const highlightRoles = [
  "keyword",
  "string",
  "constant",
  "function",
  "type",
  "property",
  "comment",
  "punctuation",
  "heading",
  "link",
  "invalid",
] as const

export type HighlightRole = (typeof highlightRoles)[number]

// Text in the code's default colour is a bare string, which keeps the payload small.
export type HighlightedToken = string | [text: string, role: HighlightRole]

export type HighlightedLines = HighlightedToken[][]
