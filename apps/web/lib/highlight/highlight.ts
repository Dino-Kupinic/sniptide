import "server-only"
import { createHash } from "node:crypto"
import { envInteger } from "@workspace/db/config"
import { highlightCache } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import type { PasteFile } from "@/lib/pastes/types"
import { observe, recordMetric } from "@/lib/telemetry"
import { editorLineCount } from "./editor-limits"
import { grammarFor } from "./grammars"
import { loadGrammar, tokenize } from "./shiki"
import { type HighlightedLines, highlightRoles } from "./types"

export { grammarFor }

// Server-side syntax highlighting for the paste pages. Shiki tokenizes with TextMate grammars, so
// the browser only gets coloured spans and no highlighter code. Colours are CSS variables (see
// ./theme.ts), which is what lets one pass serve both the light and the dark theme. The editors
// highlight in the browser instead (./use-highlight.ts).

// Past this the payload to the browser (and the time to tokenize) outweighs the colours, so the
// file renders as plain text.
const maxLines = 2000
const maxBytes = 200_000

interface Entry {
  lines: HighlightedLines
  bytes: number
  expires: number
}
// Only derived tokens are cached, in this process and for larger files in the database. Every
// caller must authorize and read current content first; cache entries cannot be addressed by slug
// or fetched through an endpoint.
const entries = new Map<string, Entry>()
const inFlight = new Map<string, Promise<HighlightedLines | undefined>>()
let residentBytes = 0
const rendererVersion = "syntax-v1"
// Code this size or larger keeps its result in the database, where a restart or another instance
// finds it. Tokenizing takes about 2 ms per KB of TypeScript on the request thread, so below this
// the lookup would cost about as much as the work it saves.
const STORE_FROM_BYTES = 2048

// A stored result holds run lengths and colour numbers, never text (see the schema). The text
// comes back from the code the caller already read, which is also what the key was made from.
export function packRuns(lines: HighlightedLines): number[][] {
  return lines.map((line) =>
    line.flatMap((token) =>
      typeof token === "string"
        ? [token.length, 0]
        : [token[0].length, highlightRoles.indexOf(token[1]) + 1],
    ),
  )
}

// Null when the runs don't fit the code, so a damaged row is treated as a miss.
export function unpackRuns(code: string, runs: number[][]): HighlightedLines | null {
  // The same line breaks the tokenizer splits on.
  const source = code.split(/\r\n|\r|\n/)
  if (!Array.isArray(runs) || runs.length !== source.length) return null
  const lines: HighlightedLines = []
  for (const [index, text] of source.entries()) {
    const line: HighlightedLines[number] = []
    const packed = runs[index] ?? []
    let at = 0
    for (let run = 0; run < packed.length; run += 2) {
      const length = packed[run]
      const role = packed[run + 1]
      if (!Number.isInteger(length) || length === undefined || length < 0 || role === undefined)
        return null
      const part = text.slice(at, at + length)
      if (part.length !== length) return null
      at += length
      if (role === 0) line.push(part)
      else {
        const name = highlightRoles[role - 1]
        if (!name) return null
        line.push([part, name])
      }
    }
    if (at !== text.length) return null
    lines.push(line)
  }
  return lines
}

async function storedOrTokenized(key: string, grammar: string, code: string) {
  const kept = Buffer.byteLength(code, "utf8") >= STORE_FROM_BYTES
  if (kept) {
    try {
      const [row] = await getDb()
        .select({ runs: highlightCache.runs })
        .from(highlightCache)
        .where(eq(highlightCache.key, key))
      const lines = row ? unpackRuns(code, row.runs) : null
      if (lines) {
        recordMetric("highlight:stored", 0)
        return lines
      }
    } catch {
      // The database is only a shortcut here; without it the code is tokenized as before.
    }
  }
  const lines = tokenize(await loadGrammar(grammar), code, grammar)
  if (kept) {
    try {
      await getDb()
        .insert(highlightCache)
        .values({ key, runs: packRuns(lines) })
        .onConflictDoUpdate({ target: highlightCache.key, set: { runs: packRuns(lines) } })
    } catch {
      console.warn(JSON.stringify({ event: "highlight_store_failed" }))
    }
  }
  return lines
}

async function tokenizeFile(file: PasteFile): Promise<HighlightedLines | undefined> {
  const grammar = grammarFor(file)
  if (!grammar) return undefined

  // Same trailing-newline handling as the code view, so the lines line up.
  const code = file.content.replace(/\n$/, "")
  if (Buffer.byteLength(code, "utf8") > maxBytes || editorLineCount(code, maxLines) > maxLines)
    return undefined
  const key = `${rendererVersion}:${grammar}:${createHash("sha256").update(code).digest("hex")}`
  const cached = entries.get(key)
  if (cached && cached.expires > Date.now()) {
    entries.delete(key)
    entries.set(key, cached)
    recordMetric("highlight:hit", 0)
    return cached.lines
  }
  if (cached) {
    entries.delete(key)
    residentBytes -= cached.bytes
  }
  const pending = inFlight.get(key)
  if (pending) return pending
  recordMetric("highlight:miss", 0)
  const work = observe("highlight:tokenize", async () => {
    const lines = await storedOrTokenized(key, grammar, code)
    const bytes = Buffer.byteLength(JSON.stringify(lines), "utf8")
    if (bytes > 1024 * 1024) return undefined
    const capacity = envInteger("HIGHLIGHT_CACHE_BYTES", 32 * 1024 * 1024, 0, 256 * 1024 * 1024)
    const previous = entries.get(key)
    if (previous) {
      entries.delete(key)
      residentBytes -= previous.bytes
    }
    while ((residentBytes + bytes > capacity || entries.size >= 1024) && entries.size) {
      const oldest = entries.entries().next().value
      if (!oldest) break
      entries.delete(oldest[0])
      residentBytes -= oldest[1].bytes
    }
    if (bytes <= capacity) {
      entries.set(key, { lines, bytes, expires: Date.now() + 600000 })
      residentBytes += bytes
    }
    return lines
  })
  if (inFlight.size < 64) inFlight.set(key, work)
  try {
    return await work
  } finally {
    inFlight.delete(key)
  }
}

export type HighlightedFile<F extends PasteFile = PasteFile> = F & { lines?: HighlightedLines }

// Adds `lines` to every file that can be highlighted. A grammar failing must never take a paste
// down with it, so those files come back unchanged and render as plain text.
export async function highlightFiles<F extends PasteFile>(
  files: F[],
): Promise<HighlightedFile<F>[]> {
  return Promise.all(
    files.map(async (file) => {
      try {
        const lines = await tokenizeFile(file)
        return lines ? { ...file, lines } : file
      } catch (error) {
        console.error(`Could not highlight ${file.name}`, error)
        return file
      }
    }),
  )
}
