import type { ThemeRegistrationRaw } from "shiki/core"
import { type HighlightRole, highlightRoles } from "./types"

// One Shiki theme whose colours are CSS variables, so light and dark come from the stylesheet
// (--syntax-* in packages/ui globals.css) and a token only has to name its role.

const prefix = "--syntax-"
const fallback = "foreground"

const color = (role: HighlightRole | typeof fallback) => `var(${prefix}${role})`

// TextMate scopes per role. The deepest scope in a token's stack decides, so a quote mark
// (punctuation.definition.string) is matched by `string` rather than by the broad `punctuation`.
const scopes: Record<HighlightRole, string[]> = {
  keyword: [
    "keyword",
    "storage",
    "variable.language",
    "keyword.operator.new",
    "keyword.operator.expression",
    "keyword.operator.word",
    "keyword.operator.logical.python",
    "punctuation.definition.template-expression",
    "punctuation.section.embedded",
    "entity.name.tag",
  ],
  string: [
    "string",
    "punctuation.definition.string",
    "markup.inline.raw",
    "markup.raw",
    "markup.fenced_code",
  ],
  constant: ["constant", "support.constant"],
  function: ["entity.name.function", "support.function", "variable.function"],
  type: [
    "entity.name.type",
    "entity.name.class",
    "entity.other.inherited-class",
    "entity.other.attribute-name",
    "support.type",
    "support.class",
  ],
  property: [
    "variable.other.property",
    "variable.other.object.property",
    "meta.object-literal.key",
    "support.type.property-name",
    "entity.name.tag.yaml",
    "variable.other.normal.shell",
    "variable.other.readwrite.hcl",
  ],
  comment: ["comment", "punctuation.definition.comment"],
  punctuation: ["punctuation", "keyword.operator", "meta.brace"],
  heading: ["markup.heading", "entity.name.section", "punctuation.definition.heading"],
  link: ["markup.underline.link", "string.other.link"],
  invalid: ["invalid"],
}

// Broad selectors first: when two rules match at the same depth, the later one wins.
const order: HighlightRole[] = [
  "punctuation",
  "keyword",
  "constant",
  "function",
  "type",
  "property",
  "string",
  "comment",
  "heading",
  "link",
  "invalid",
]

export const themeName = "sniptide"

export const theme: ThemeRegistrationRaw = {
  name: themeName,
  type: "light",
  fg: color(fallback),
  bg: "transparent",
  settings: [
    { settings: { foreground: color(fallback) } },
    ...order.map((role) => ({ scope: scopes[role], settings: { foreground: color(role) } })),
  ],
}

// A token's colour back to its role; the default colour has none.
export function roleOf(tokenColor: string | undefined): HighlightRole | undefined {
  if (!tokenColor?.startsWith(`var(${prefix}`)) return undefined
  const name = tokenColor.slice(`var(${prefix}`.length, -1)
  return (highlightRoles as readonly string[]).includes(name) ? (name as HighlightRole) : undefined
}
