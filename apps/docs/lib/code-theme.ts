// The app's code theme (apps/web/lib/highlight/theme.ts): one Shiki theme whose colours are the
// --syntax-* variables from packages/ui globals.css, so code blocks switch with light and dark and
// read the same as a paste. Keep the scopes in step with the app's.

type Role =
  | "keyword"
  | "string"
  | "constant"
  | "function"
  | "type"
  | "property"
  | "comment"
  | "punctuation"
  | "heading"
  | "link"
  | "invalid"

// Headings in Markdown share the keyword blue, as in the app's code view.
const variable: Record<Role, string> = {
  keyword: "--syntax-keyword",
  string: "--syntax-string",
  constant: "--syntax-constant",
  function: "--syntax-function",
  type: "--syntax-type",
  property: "--syntax-property",
  comment: "--syntax-comment",
  punctuation: "--syntax-punctuation",
  heading: "--syntax-keyword",
  link: "--syntax-link",
  invalid: "--syntax-invalid",
}

// TextMate scopes per role. The deepest scope in a token's stack decides, so a quote mark
// (punctuation.definition.string) is matched by `string` rather than by the broad `punctuation`.
const scopes: Record<Role, string[]> = {
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
const order: Role[] = [
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

export const codeTheme = {
  name: "sniptide",
  type: "light" as const,
  fg: "var(--syntax-foreground)",
  bg: "transparent",
  settings: [
    { settings: { foreground: "var(--syntax-foreground)" } },
    ...order.map((role) => ({
      scope: scopes[role],
      settings: { foreground: `var(${variable[role]})` },
    })),
  ],
}
