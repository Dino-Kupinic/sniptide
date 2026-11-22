import "server-only"

import type { Database } from "@workspace/db"
import { pasteFile, paste as pasteTable } from "@workspace/db/schema"
import { and, ilike, isNull, or, type SQL, sql } from "drizzle-orm"
import type { PasteSearchMatch } from "./types"

// At most this many words of a query are matched, so a long query can't build a huge filter.
const MAX_QUERY_WORDS = 8

// The distinct lowercase words of a query, in the order they were typed.
function queryWords(q: string) {
  return [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, MAX_QUERY_WORDS)
}

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`

// A paste matches a query when every word of it appears somewhere in the paste: the title, slug,
// description, a tag, or the path or code of one of its files. Agents search with phrases such
// as "retry with backoff", and people remember a snippet by a function name inside it, neither of
// which sits in a title as written. The API, the MCP server's search_snippets, the ⌘K menu and the
// pastes list all match this way.
//
// `offset 0` keeps the file check a per-paste index probe. Without it PostgreSQL may run the check
// once as a scan of every account's files, so a search would cost as much as the whole instance
// holds instead of what the caller's account holds, and couldn't stop at the first full page.
export function matchesQuery(q: string): SQL | undefined {
  return and(
    ...queryWords(q).map((word) => {
      const pattern = likePattern(word)
      return or(
        ilike(pasteTable.title, pattern),
        ilike(pasteTable.slug, pattern),
        ilike(pasteTable.description, pattern),
        sql`array_to_string(${pasteTable.tags}, ' ') ilike ${pattern}`,
        sql`exists (
          select 1 from ${pasteFile} f
          where f.paste_id = ${pasteTable}.id and (f.name ilike ${pattern} or f.content ilike ${pattern})
          offset 0)`,
      )
    }),
  )
}

// What the viewer's own lists and the ⌘K menu match. The files of an end-to-end encrypted paste
// hold ciphertext the server can't read, so those pastes match on the typed text in their title
// or slug only, and a word can't match by chance inside the ciphertext.
export function matchesOwnQuery(q: string): SQL | undefined {
  const text = q.trim()
  if (!text) return undefined
  const pattern = likePattern(text)
  return or(
    ilike(pasteTable.title, pattern),
    ilike(pasteTable.slug, pattern),
    and(isNull(pasteTable.encryptionKeyId), matchesQuery(text)),
  )
}

// Longest stretch of a matched line that a result row shows. A row has room for far less on a
// phone, so the excerpt starts just before the match and the row truncates what follows.
const EXCERPT_CHARS = 80
// Characters of the line kept before the match, so the word reads in its context.
const LEAD_CHARS = 12
// A line this short fits a row whole, so it is never cut.
const SHORT_LINE = 48
// How much code on each side of the first occurrence is read, which covers any line a row shows.
const WINDOW_CHARS = 200

// Where each hit matched, for the words its title and slug don't already show: the first file
// whose path or code holds the word, with the line it sits on. One statement for the whole page
// of hits, reading a short window of each file instead of its full contents.
export async function findMatches(
  db: Pick<Database, "execute">,
  hits: { id: string; title: string; slug: string }[],
  q: string,
): Promise<Map<string, PasteSearchMatch>> {
  const words = queryWords(q)
  const result = new Map<string, PasteSearchMatch>()
  const pending = hits.filter((hit) => words.some((word) => !shownIn(hit, word)))
  if (pending.length === 0) return result
  const list = (values: string[]) =>
    sql.join(
      values.map((value) => sql`${value}`),
      sql`, `,
    )
  const rows = await db.execute<{
    paste_id: string
    word: number
    name: string
    in_name: boolean
    line: number | null
    window: string | null
    cut_before: boolean
    cut_after: boolean
  }>(sql`
    select distinct on (f.paste_id, w.n)
      f.paste_id, w.n::int as word, f.name,
      strpos(lower(f.name), w.word) > 0 as in_name,
      case when m.at > 0 then
        length(left(f.content, m.at)) - length(replace(left(f.content, m.at), chr(10), '')) + 1
      end::int as line,
      case when m.at > 0 then
        substr(f.content, greatest(m.at - ${WINDOW_CHARS}, 1), ${WINDOW_CHARS * 2} + length(w.word))
      end as window,
      m.at > ${WINDOW_CHARS + 1} as cut_before,
      length(f.content) >= m.at + ${WINDOW_CHARS} + length(w.word) as cut_after
    from unnest(array[${list(words)}]::text[]) with ordinality as w(word, n)
    join ${pasteFile} f on f.paste_id in (${list(pending.map((hit) => hit.id))})
    cross join lateral (select strpos(lower(f.content), w.word) as at) m
    where strpos(lower(f.name), w.word) > 0 or m.at > 0
    order by f.paste_id, w.n, f.position`)
  for (const hit of pending) {
    // Rows come ordered by word, so the first one the title and slug don't show is the one to use.
    const row = rows.find(
      (candidate) =>
        candidate.paste_id === hit.id && !shownIn(hit, words[candidate.word - 1] ?? ""),
    )
    if (!row) continue
    const word = words[row.word - 1] ?? ""
    // A match in the path is what the row shows; the line only helps when the word is in the code.
    const excerpt =
      !row.in_name && row.window
        ? lineAround(row.window, word, row.cut_before, row.cut_after)
        : null
    result.set(hit.id, { file: row.name, line: excerpt ? row.line : null, excerpt })
  }
  return result
}

function shownIn(hit: { title: string; slug: string }, word: string) {
  return hit.title.toLowerCase().includes(word) || hit.slug.toLowerCase().includes(word)
}

// The line around the first occurrence of `word` in `window`, trimmed of indentation and cut to
// EXCERPT_CHARS with an ellipsis on a side that was cut. `cutBefore` and `cutAfter` say whether the
// window itself starts or ends inside the file, so a line that runs past it is marked as cut too.
export function lineAround(
  window: string,
  word: string,
  cutBefore = false,
  cutAfter = false,
): string | null {
  const at = window.toLowerCase().indexOf(word)
  if (at === -1) return null
  const lineStart = window.lastIndexOf("\n", at) + 1
  const newline = window.indexOf("\n", at)
  const line = window.slice(lineStart, newline === -1 ? undefined : newline).replace(/\r$/, "")
  const indent = line.length - line.trimStart().length
  const text = line.trim()
  const offset = at - lineStart - indent
  let lead = text.length > SHORT_LINE && offset > LEAD_CHARS ? offset - LEAD_CHARS : 0
  // Start at a word boundary when one sits in the kept context, so the excerpt doesn't open
  // mid-word.
  const space = text.indexOf(" ", lead)
  if (lead > 0 && space !== -1 && space < offset - 1) lead = space + 1
  const before = lead > 0 || (cutBefore && lineStart === 0 && indent === 0)
  const after = lead + EXCERPT_CHARS < text.length || (cutAfter && newline === -1)
  return `${before ? "…" : ""}${text.slice(lead, lead + EXCERPT_CHARS)}${after ? "…" : ""}`
}
