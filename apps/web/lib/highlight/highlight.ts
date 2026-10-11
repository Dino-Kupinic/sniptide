import "server-only"
import { createHash } from "node:crypto"
import { envInteger } from "@workspace/db/config"
import type { PasteFile } from "@/lib/pastes/types"
import { observe, recordMetric } from "@/lib/telemetry"
import { grammarFor } from "./grammars"
import { loadGrammar, tokenize } from "./shiki"
import type { HighlightedLines } from "./types"

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
// Only derived tokens are cached. Every caller must authorize and read current content first;
// cache entries cannot be addressed by slug or fetched through an endpoint.
const entries = new Map<string, Entry>()
const inFlight = new Map<string, Promise<HighlightedLines | undefined>>()
let residentBytes = 0
const rendererVersion = "syntax-v1"
async function tokenizeFile(file: PasteFile): Promise<HighlightedLines | undefined> {
  const grammar = grammarFor(file)
  if (!grammar) return undefined

  // Same trailing-newline handling as the code view, so the lines line up.
  const code = file.content.replace(/\n$/, "")
  if (Buffer.byteLength(code, "utf8") > maxBytes || code.split("\n").length > maxLines)
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
    const lines = tokenize(await loadGrammar(grammar), code, grammar)
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
