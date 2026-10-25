// Generates lib/pastes/language-data.ts, lib/highlight/grammar-loaders.ts and the logos in
// public/languages from three sources:
// Shiki (every language it can highlight), GitHub Linguist (file extensions and names) and
// Material Icon Theme (logos). Run it after upgrading any of them:
//
//   bun scripts/generate-languages.ts
//
// The output is committed, so neither the build nor the app needs these packages.

import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import icons from "@iconify-json/material-icon-theme/icons.json"
import * as linguist from "linguist-languages"
import { bundledLanguagesInfo } from "shiki/langs"

const root = path.join(import.meta.dirname, "..")
const iconDir = path.join(root, "public/languages")
const dataFile = path.join(root, "lib/pastes/language-data.ts")
const loaderFile = path.join(root, "lib/highlight/grammar-loaders.ts")

interface LinguistLanguage {
  name: string
  aliases?: readonly string[]
  extensions?: readonly string[]
  filenames?: readonly string[]
}

// Shiki entries that are not languages a person would pick: a grammar other grammars embed, and
// the TSX and JSX dialects, which TypeScript and JavaScript files highlight by their extension.
const skipped = new Set(["html-derivative", "tsx", "jsx"])

// Ids that Sniptide stored before it used Shiki's ids. Pastes keep them, so they stay.
const legacyIds: Record<string, string> = { shellscript: "shell" }

// Shorter or better known names than Shiki's.
const names: Record<string, string> = {
  bat: "Batch",
  hcl: "HCL",
  docker: "Docker",
  log: "Log",
  nushell: "Nushell",
  proto: "Protocol Buffers",
  "objective-c": "Objective-C",
  "git-commit": "Git commit message",
  "git-rebase": "Git rebase todo",
  "system-verilog": "SystemVerilog",
  systemd: "systemd unit",
  "ssh-config": "SSH config",
  "fortran-fixed-form": "Fortran (fixed form)",
  "fortran-free-form": "Fortran",
  shellsession: "Shell session",
  "html-derivative": "HTML",
}

// The extensions and file names Sniptide used before, which keep their meaning.
const legacy: Record<string, { extensions?: string[]; filenames?: string[] }> = {
  typescript: { extensions: ["ts", "tsx", "mts", "cts"] },
  javascript: { extensions: ["js", "jsx", "mjs", "cjs"] },
  sql: { extensions: ["sql"] },
  shellscript: {
    extensions: ["sh", "bash", "zsh"],
    filenames: [".zshrc", ".bashrc", ".profile", "crontab"],
  },
  python: { extensions: ["py"] },
  nginx: { extensions: ["nginx"], filenames: ["nginx.conf"] },
  docker: {
    extensions: ["dockerfile"],
    filenames: ["Dockerfile", "docker-compose.yml", "compose.yaml", "compose.yml"],
  },
  yaml: { extensions: ["yaml", "yml"] },
  go: { extensions: ["go"] },
  hcl: { extensions: ["hcl"] },
  terraform: { extensions: ["tf", "tfvars"] },
  json: { extensions: ["json"] },
  markdown: { extensions: ["md", "mdx"] },
}

// Linguist names for Shiki languages whose names differ.
const linguistNames: Record<string, string[]> = {
  "actionscript-3": ["ActionScript"],
  ahk: ["AutoHotkey"],
  ahk2: [],
  "angular-html": [],
  "angular-ts": [],
  apache: ["ApacheConf"],
  asm: ["Assembly", "Unix Assembly"],
  bat: ["Batchfile"],
  bird2: [],
  bsl: ["1C Enterprise"],
  coq: ["Rocq Prover"],
  "common-lisp": ["Common Lisp"],
  desktop: ["desktop"],
  docker: ["Dockerfile"],
  dotenv: ["Dotenv"],
  "fortran-fixed-form": ["Fortran"],
  "fortran-free-form": ["Fortran Free Form"],
  "git-commit": ["Git Commit"],
  "git-rebase": ["Git Revision List"],
  haml: ["Haml"],
  hcl: ["HCL"],
  "html-derivative": [],
  jssm: [],
  kusto: ["Kusto"],
  lean: ["Lean 4"],
  llvm: ["LLVM"],
  make: ["Makefile"],
  mdc: [],
  mipsasm: [],
  narrat: [],
  "nextflow-groovy": [],
  "objective-cpp": ["Objective-C++"],
  po: ["Gettext Catalog"],
  proto: ["Protocol Buffer"],
  razor: ["HTML+Razor"],
  riscv: [],
  sdbl: [],
  shellscript: ["Shell"],
  shellsession: ["ShellSession"],
  smalltalk: ["Smalltalk"],
  "ssh-config": ["SSH Config"],
  systemd: [],
  terraform: ["Terraform Template"],
  "ts-tags": [],
  vb: ["Visual Basic .NET", "VBA"],
  viml: ["Vim script"],
  "vue-html": [],
  "vue-vine": [],
  wasm: ["WebAssembly"],
  wolfram: ["Wolfram Language"],
  xsl: ["XSLT"],
}

// Extensions and file names Linguist does not list for a language.
const extra: Record<string, { extensions?: string[]; filenames?: string[] }> = {
  ahk2: { extensions: ["ahk2"] },
  "angular-html": { extensions: ["component.html"] },
  "angular-ts": { extensions: ["component.ts"] },
  bird2: { extensions: ["bird"], filenames: ["bird.conf"] },
  codeowners: { filenames: ["CODEOWNERS"] },
  make: { filenames: ["Makefile"] },
  desktop: { extensions: ["desktop"] },
  "git-commit": { filenames: ["COMMIT_EDITMSG"] },
  "git-rebase": { filenames: ["git-rebase-todo"] },
  log: { extensions: ["log"] },
  mipsasm: { extensions: ["mips"] },
  riscv: { extensions: ["riscv"] },
  mdc: { extensions: ["mdc"] },
  narrat: { extensions: ["narrat", "nar"] },
  "nextflow-groovy": { extensions: ["nf.groovy"] },
  sdbl: { extensions: ["sdbl"] },
  v: { extensions: ["vv", "vsh"] },
  systemd: { extensions: ["service", "socket", "timer", "mount", "target", "path"] },
  "ts-tags": { extensions: ["lit.ts"] },
  "vue-html": { extensions: ["vue.html"] },
  "vue-vine": { extensions: ["vine.ts"] },
}

// Extensions too many languages share to say anything.
const ambiguous = new Set(["inc", "i", "in", "src", "tpl", "conf", "config", "cfg"])

// When two languages claim one extension, the earlier one here keeps it.
const claimOrder = [
  "typescript",
  "javascript",
  "python",
  "shellscript",
  "sql",
  "json",
  "yaml",
  "markdown",
  "html",
  "css",
  "c",
  "cpp",
  "csharp",
  "java",
  "php",
  "ruby",
  "rust",
  "go",
  "kotlin",
  "swift",
  "xml",
  "ini",
  "perl",
  "objective-c",
  "matlab",
  "verilog",
  "v",
  "fsharp",
  "scheme",
  "common-lisp",
  "fortran-free-form",
  "terraform",
  "hcl",
]

// Material Icon Theme names for languages whose ids differ.
const iconNames: Record<string, string> = {
  ahk2: "autohotkey",
  "angular-html": "angular",
  "angular-ts": "angular",
  apex: "salesforce",
  bat: "console",
  bibtex: "bibtex-style",
  blade: "laravel",
  csv: "table",
  dotenv: "tune",
  "emacs-lisp": "lisp",
  erb: "ruby",
  fish: "console",
  "fortran-fixed-form": "fortran",
  "fortran-free-form": "fortran",
  gdresource: "godot-assets",
  gdscript: "godot",
  gdshader: "godot",
  gherkin: "cucumber",
  "git-commit": "git",
  "git-rebase": "git",
  "glimmer-js": "ember",
  "glimmer-ts": "ember",
  glsl: "shader",
  hlsl: "shader",
  ini: "settings",
  json5: "json",
  jsonc: "json",
  jsonl: "json",
  jsonnet: "json",
  latex: "tex",
  marko: "markojs",
  mipsasm: "assembly",
  "nextflow-groovy": "nextflow",
  nushell: "console",
  plsql: "database",
  reg: "regedit",
  riscv: "assembly",
  scss: "sass",
  shellscript: "console",
  shellsession: "console",
  sql: "database",
  "system-verilog": "verilog",
  "ts-tags": "typescript",
  tsv: "table",
  v: "vlang",
  vb: "visualstudio",
  "vue-html": "vue",
  "vue-vine": "vue",
  wgsl: "shader",
  wolfram: "wolframlanguage",
  xsl: "xml",
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#]/g, "")

const linguistByKey = new Map<string, LinguistLanguage>()
for (const language of Object.values(linguist) as LinguistLanguage[]) {
  for (const key of [language.name, ...(language.aliases ?? [])]) {
    const normalized = normalize(key)
    if (!linguistByKey.has(normalized)) linguistByKey.set(normalized, language)
  }
}

function linguistFor(shiki: (typeof bundledLanguagesInfo)[number]): LinguistLanguage[] {
  const explicit = linguistNames[shiki.id]
  if (explicit)
    return explicit.flatMap((name) => {
      const found = (linguist as Record<string, LinguistLanguage>)[name]
      if (!found) throw new Error(`Linguist has no language named ${name}`)
      return [found]
    })
  for (const key of [shiki.name, shiki.id, ...(shiki.aliases ?? [])]) {
    const found = linguistByKey.get(normalize(key))
    if (found) return [found]
  }
  return []
}

const iconSet = icons.icons as Record<string, { body: string; width?: number; height?: number }>

function iconFor(id: string, aliases: string[]): string | undefined {
  const candidates = [iconNames[id], id, ...aliases].filter(Boolean) as string[]
  return candidates.find((candidate) => iconSet[candidate])
}

// Iconify's default size is 16 when neither the icon nor the set names one.
const svg = ({
  body,
  left = 0,
  top = 0,
  width = 16,
  height = 16,
}: {
  body: string
  left?: number
  top?: number
  width?: number
  height?: number
}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}">${body}</svg>\n`

interface Entry {
  id: string
  name: string
  grammar?: string
  extensions: string[]
  filenames: string[]
  icon: string
  iconLight?: boolean
}

const entries: Entry[] = []
const unmatched: string[] = []
for (const shiki of bundledLanguagesInfo) {
  if (skipped.has(shiki.id)) continue
  const sources = linguistFor(shiki)
  if (!sources.length && !extra[shiki.id] && !legacy[shiki.id]) unmatched.push(shiki.id)
  const extensions = [
    ...(legacy[shiki.id]?.extensions ?? []),
    ...(extra[shiki.id]?.extensions ?? []),
    ...sources.flatMap((source) => source.extensions ?? []).map((ext) => ext.slice(1)),
  ]
    .map((ext) => ext.toLowerCase())
    // Detection reads the part after the last dot, so longer suffixes would never match.
    .filter((ext) => !ext.includes(".") && !ambiguous.has(ext))
  const filenames = [
    ...(legacy[shiki.id]?.filenames ?? []),
    ...(extra[shiki.id]?.filenames ?? []),
    ...sources.flatMap((source) => source.filenames ?? []),
  ]
  const id = legacyIds[shiki.id] ?? shiki.id
  const icon = iconFor(shiki.id, [...(shiki.aliases ?? []), normalize(shiki.name)])
  entries.push({
    id,
    name: names[shiki.id] ?? shiki.name,
    grammar: id === shiki.id ? undefined : shiki.id,
    extensions: [...new Set(extensions)],
    filenames: [...new Set(filenames)],
    icon: icon ?? "document",
    iconLight: icon ? Boolean(iconSet[`${icon}-light`]) : false,
  })
}
entries.push({
  id: "text",
  name: "Plain text",
  extensions: ["txt"],
  filenames: [],
  icon: "document",
  iconLight: false,
})

// Every extension and file name belongs to one language: the first in claimOrder, then the one
// that lists it first, then the alphabetically first.
const rank = (entry: Entry) => {
  const shikiId = entry.grammar ?? entry.id
  const index = claimOrder.indexOf(shikiId)
  return index === -1 ? claimOrder.length : index
}
for (const field of ["extensions", "filenames"] as const) {
  const owners = new Map<string, Entry>()
  for (const entry of entries) {
    for (const [position, value] of entry[field].entries()) {
      const key = field === "extensions" ? value : value.toLowerCase()
      const current = owners.get(key)
      if (!current) {
        owners.set(key, entry)
        continue
      }
      const currentPosition = current[field].indexOf(value)
      const wins =
        rank(entry) < rank(current) ||
        (rank(entry) === rank(current) && position === 0 && currentPosition !== 0)
      if (wins) owners.set(key, entry)
    }
  }
  for (const entry of entries)
    entry[field] = entry[field].filter(
      (value) => owners.get(field === "extensions" ? value : value.toLowerCase()) === entry,
    )
}

// Extensions given to one language outright, where the rules above would leave it none of its own.
const owned: Record<string, string> = { mojo: "mojo", sty: "tex", dtx: "tex", ins: "tex" }
for (const [extension, id] of Object.entries(owned)) {
  for (const entry of entries)
    entry.extensions = entry.extensions.filter((ext) => ext !== extension)
  entries.find((entry) => entry.id === id)?.extensions.unshift(extension)
}

// A language needs a name to rename a file to, so one without an extension or file name left
// gets its id as the extension.
for (const entry of entries) {
  if (!entry.extensions.length && !entry.filenames.length) entry.extensions.push(entry.id)
}

entries.sort((a, b) => a.name.localeCompare(b.name, "en"))

await rm(iconDir, { recursive: true, force: true })
await mkdir(iconDir, { recursive: true })
const written = new Set<string>()
for (const entry of entries) {
  if (written.has(entry.icon)) continue
  written.add(entry.icon)
  const icon = iconSet[entry.icon]
  if (!icon) throw new Error(`Material Icon Theme has no icon named ${entry.icon}`)
  await writeFile(path.join(iconDir, `${entry.icon}.svg`), svg(icon))
  const light = iconSet[`${entry.icon}-light`]
  if (entry.iconLight && light)
    await writeFile(path.join(iconDir, `${entry.icon}-light.svg`), svg(light))
}

const rows = entries.map((entry) => {
  const fields: string[] = [
    `id: ${JSON.stringify(entry.id)}`,
    `name: ${JSON.stringify(entry.name)}`,
  ]
  if (entry.grammar) fields.push(`grammar: ${JSON.stringify(entry.grammar)}`)
  fields.push(`extensions: ${JSON.stringify(entry.extensions)}`)
  if (entry.filenames.length) fields.push(`filenames: ${JSON.stringify(entry.filenames)}`)
  fields.push(`icon: ${JSON.stringify(entry.icon)}`)
  if (entry.iconLight) fields.push("iconLight: true")
  return `  { ${fields.join(", ")} },`
})

await writeFile(
  dataFile,
  `// Generated by scripts/generate-languages.ts from Shiki, GitHub Linguist and Material Icon Theme.
// Edit the script and run it again rather than editing this file.

import type { LanguageData } from "./languages"

export const languageData: LanguageData[] = [
${rows.join("\n")}
]
`,
)

// One explicit import per grammar, so the bundler splits each into its own chunk without
// shipping Shiki's language list to the browser.
const loaders = bundledLanguagesInfo.map(
  (shiki) =>
    `  ${JSON.stringify(shiki.id)}: () => import(${JSON.stringify(`@shikijs/langs/${shiki.id}`)}),`,
)
await writeFile(
  loaderFile,
  `// Generated by scripts/generate-languages.ts. Edit the script and run it again rather than
// editing this file.

import type { LanguageInput } from "shiki/core"

export const grammarLoaders: Record<string, LanguageInput> = {
${loaders.join("\n")}
}
`,
)

// Formatted like the hand-written code, so a rerun shows only real changes.
Bun.spawnSync(["bunx", "biome", "format", "--write", dataFile, loaderFile], {
  stdio: ["inherit", "inherit", "inherit"],
})

console.log(`${entries.length} languages, ${written.size} logos`)
const fallback = entries.filter((entry) => entry.icon === "document").map((entry) => entry.id)
if (fallback.length) console.log(`Generic file icon: ${fallback.join(", ")}`)
if (unmatched.length) console.log(`No Linguist data: ${unmatched.join(", ")}`)
