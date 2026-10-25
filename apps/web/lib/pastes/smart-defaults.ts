import { findSecrets } from "@/lib/secrets"
import { getLanguage, renameForLanguage } from "./languages"
import type { Visibility } from "./types"

type File = { name: string; content: string }

const generatedName = /^(?:untitled(?:-\d+)?|snippet)\.[^.]+$/i
const environmentName = /(?:^|[/\\])(?:\.env(?:\..+)?|[^/\\]+\.env)$/i
const environmentLine = /^(?:export\s+)?[A-Z_][A-Z0-9_]*\s*=\s*\S/m

export function hasSensitiveContent(files: File[]) {
  return (
    files.some((file) => environmentName.test(file.name) || environmentLine.test(file.content)) ||
    findSecrets(files) !== null
  )
}

export function suggestedVisibility(files: File[], fallback: Visibility): Visibility {
  return hasSensitiveContent(files) ? "private" : fallback
}

const contentPatterns: { language: string; pattern: RegExp }[] = [
  { language: "shell", pattern: /^#![^\n]*\b(?:ba|z|fi|k)?sh\b|^(?:export\s+)?[A-Z_][A-Z0-9_]*=/m },
  {
    language: "python",
    pattern:
      /^#![^\n]*python|^\s*(?:from\s+[\w.]+\s+import\s|def\s+\w+\(|class\s+\w+[^\n]*:|import\s+[\w.]+\s*$)|\bprint\s*\(/m,
  },
  { language: "php", pattern: /<\?php\b/ },
  { language: "go", pattern: /^package\s+\w+|^func\s+(?:\([^)]*\)\s*)?\w+\(/m },
  {
    language: "rust",
    pattern: /^(?:pub\s+)?(?:async\s+)?fn\s+\w+\(|^use\s+\w+::|\b(?:println!|let\s+mut)\b/m,
  },
  {
    language: "java",
    pattern: /\bpublic\s+(?:static\s+void\s+main|class\s+\w+)|^import\s+java\./m,
  },
  { language: "csharp", pattern: /^using\s+System\b|\bConsole\.WriteLine\(/m },
  { language: "cpp", pattern: /#include\s*<iostream>|\bstd::/ },
  { language: "c", pattern: /^\s*#include\s*[<"]|\bint\s+main\s*\(/m },
  {
    language: "sql",
    pattern:
      /^\s*(?:SELECT\s+[\s\S]+?\bFROM\b|INSERT\s+INTO\b|CREATE\s+TABLE\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|WITH\s+\w+\s+AS\s*\()/im,
  },
  { language: "docker", pattern: /^FROM\s+[\w./:-]+(?:\s+AS\s+\w+)?\s*$/m },
  {
    language: "html",
    pattern: /<!doctype\s+html|<html\b|<(?:div|section|head|body|p|h[1-6])(?:\s|>)/i,
  },
  {
    language: "typescript",
    pattern:
      /^(?:export\s+)?(?:interface|type|enum)\s+\w+|\b(?:const|let)\s+\w+\s*:\s*[\w[{]|\)\s*:\s*\w+\s*(?:=>|\{)|\bfunction\s+\w+\([^)]*\w+\s*:\s*\w+|\([^)]*\w+\s*:\s*\w+[^)]*\)\s*=>/m,
  },
  {
    language: "javascript",
    pattern:
      /^(?:(?:export|async)\s+)*(?:const|let|var|function)\s+\w+|^import\s+.+\s+from\s+['"]|\bconsole\.log\s*\(/m,
  },
  {
    language: "css",
    pattern: /(?:^|\n)\s*[.#]?[\w-]+(?:\s*[,>][^{]+)?\s*\{\s*[\w-]+\s*:\s*[^\n]+[;}]/,
  },
  { language: "yaml", pattern: /^(?:[\w.-]+:[ \t]*[^\n]*\n)+[\w.-]+:[ \t]*|^---\s*\n[\w.-]+:/m },
  { language: "markdown", pattern: /^#{1,6}\s+\S|^```\w*\s*$|^\s*[-*]\s+\S/m },
]

export function detectContentLanguage(content: string) {
  const sample = content.trim().slice(0, 16_384)
  if (/^[{[]/.test(sample)) {
    try {
      JSON.parse(content)
      return getLanguage("json")
    } catch {}
  }
  return getLanguage(
    contentPatterns.find(({ pattern }) => pattern.test(sample))?.language ?? "text",
  )
}

export function suggestedFilename(file: File) {
  if (!generatedName.test(file.name)) return file.name
  const language = detectContentLanguage(file.content)
  return language.id === "text" ? file.name : renameForLanguage(file.name, language)
}

export function suggestedTitle(files: File[]) {
  const file = files.find((candidate) => candidate.content.trim()) ?? files[0]
  if (!file) return ""
  if (hasSensitiveContent(files) || !generatedName.test(file.name)) return file.name.slice(0, 120)
  if (!file.content.trim()) return ""
  const first = file.content
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:\/{2,}|#+|\/\*+|\*\/?|--|;)\s*/, "")
        .replace(/\s*\*\/$/, ""),
    )
    .find((line) => line.trim())
  return (first || file.name).slice(0, 120)
}
