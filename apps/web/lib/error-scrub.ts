import { scrubUrl } from "@/lib/analytics"

// Removes what an exception must never carry to an error tracker: paste content, links' slugs,
// handles, tokens, email addresses and query strings. Error messages are free text, so this
// keeps only their shape:
//
// - URLs keep their origin and route, as product analytics does (scrubUrl).
// - Quoted values are replaced, because messages from Postgres, JSON.parse, zod and the app quote
//   the value that failed ("invalid input syntax for type uuid: \"k7Qe2x\"").
// - A failed query's parameters and Postgres' "Key (slug)=(value)" details are replaced.
// - Email addresses, API tokens, JWTs, bearer credentials and long random strings are replaced.
//
// The module has no server imports so the browser can use it too.

const MAX_MESSAGE = 1000

const replacements: [RegExp, string | ((match: string, ...groups: string[]) => string)][] = [
  // Drizzle's "Failed query: ... params: <values>" holds paste content in its parameters.
  [/(\bparams:)[\s\S]*$/i, "$1 [redacted]"],
  [/\b(?:https?|wss?):\/\/[^\s"'`<>)]+/gi, (url) => scrubUrl(url)],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g, "[email]"],
  [/\b(?:bearer|basic)\s+[\w.~+/=-]+/gi, "[credential]"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[token]"],
  [/\b(?:snpt|phc|phx|sk|pk|ghp|gho|github_pat|xox[abp])_[\w-]+/gi, "[token]"],
  // A run of 24 or more letters, digits, - or _ with at least one digit is a key, hash or random
  // ID rather than a word. File paths and stack frames never reach this function.
  [/\b(?=[\w-]*\d)[\w-]{24,}\b/g, "[token]"],
  // Postgres details: Key (slug)=(k7Qe2x) already exists.
  [/(\([\w", ]+\)=)\([^)]*\)/g, "$1([redacted])"],
  [/"(?:[^"\\\n]|\\.)*"/g, '"[redacted]"'],
  [/'(?:[^'\\\n]|\\.)*'/g, "'[redacted]'"],
  [/`[^`\n]*`/g, "`[redacted]`"],
  [/“[^”\n]*”/g, "“[redacted]”"],
  [/@[A-Za-z0-9][\w-]*\/[\w.~-]+/g, "@[handle]/[slug]"],
]

export function scrubErrorText(value: string) {
  let text = value
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement as string)
  }
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text
}

export interface StackFrame {
  platform: "node:javascript"
  filename: string
  function: string
  lineno?: number
  colno?: number
  in_app: boolean
}

// V8 frames: "at fn (file:line:col)", "at file:line:col" and "at async fn (file:line:col)".
const FRAME =
  /^\s*at (?:(?:async )?(.+?) \((.+?)(?::(\d+))?(?::(\d+))?\)|(.+?)(?::(\d+))?(?::(\d+))?)$/

// Frames name code, not data, but a filename can carry a query string or a data: URL, and an
// eval'd function can be named after its input, so both are reduced.
function scrubFilename(filename: string) {
  if (/^data:/i.test(filename)) return "data:[redacted]"
  return scrubErrorText(filename.replace(/[?#].*$/, ""))
}

// Parses an Error's stack into PostHog's frame format, oldest call first as PostHog expects.
export function parseStack(stack: string | undefined, limit = 50): StackFrame[] {
  if (!stack) return []
  const frames: StackFrame[] = []
  for (const line of stack.split("\n")) {
    const match = FRAME.exec(line)
    if (!match) continue
    const [, fn, file, line1, col1, bareFile, line2, col2] = match
    const filename = file ?? bareFile
    if (!filename) continue
    const lineno = Number(line1 ?? line2)
    const colno = Number(col1 ?? col2)
    frames.push({
      platform: "node:javascript",
      filename: scrubFilename(filename),
      function: fn ? scrubErrorText(fn) : "?",
      ...(Number.isFinite(lineno) ? { lineno } : {}),
      ...(Number.isFinite(colno) ? { colno } : {}),
      in_app: !/node_modules|^node:|^internal\//.test(filename),
    })
    if (frames.length >= limit) break
  }
  return frames.reverse()
}

export interface ScrubbedException {
  type: string
  value: string
  mechanism: { type: string; handled: boolean; synthetic: boolean }
  stacktrace: { type: "raw"; frames: StackFrame[] }
}

// Turns a thrown value and up to three of its causes into PostHog's $exception_list. Only the
// error's class name, scrubbed message and frames are kept; other properties an error carries
// (a query, a request, a paste) are dropped.
export function toExceptionList(error: unknown, mechanism: string, handled = false) {
  const list: ScrubbedException[] = []
  let current: unknown = error
  const seen = new Set<unknown>()
  while (current !== undefined && current !== null && list.length < 4 && !seen.has(current)) {
    seen.add(current)
    const error = current instanceof Error ? current : undefined
    const name = error ? error.name || error.constructor.name : "Error"
    list.push({
      type: /^[\w$.]{1,80}$/.test(name) ? name : "Error",
      value: scrubErrorText(
        error ? error.message : typeof current === "string" ? current : "Non-Error thrown",
      ),
      mechanism: { type: mechanism, handled, synthetic: !error },
      stacktrace: { type: "raw", frames: error ? parseStack(error.stack) : [] },
    })
    current = error?.cause
  }
  return list
}
