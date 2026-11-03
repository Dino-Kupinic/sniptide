import "server-only"
import { pasteFile, paste as pasteTable } from "@workspace/db/schema"
import { asc, inArray, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { highlightFiles } from "@/lib/highlight/highlight"
import type { HighlightedLines } from "@/lib/highlight/types"
import { previewLines } from "./preview"
import type { PasteSummary } from "./types"

// Lines a paste card shows before its code panel runs off the bottom edge.
export const CARD_PREVIEW_LINES = 6

// The first lines of each paste's first file, highlighted, for the cards of a paste list. Only
// the start of the content is read, so a large paste costs no more than a small one. Someone
// else's password-protected paste shows no code, since the viewer may not have unlocked it.
export async function cardPreviews(
  pastes: PasteSummary[],
): Promise<Record<string, HighlightedLines>> {
  const slugs = pastes
    .filter((paste) => !(paste.password && paste.owner))
    .map((paste) => paste.slug)
  if (slugs.length === 0) return {}

  const files = await getDb()
    .selectDistinctOn([pasteFile.pasteId], {
      slug: pasteTable.slug,
      name: pasteFile.name,
      language: pasteFile.language,
      content: sql<string>`left(${pasteFile.content}, 2000)`,
    })
    .from(pasteFile)
    .innerJoin(pasteTable, sql`${pasteTable.id} = ${pasteFile.pasteId}`)
    .where(inArray(pasteTable.slug, slugs))
    .orderBy(pasteFile.pasteId, asc(pasteFile.position))

  const highlighted = await highlightFiles(
    files.map((file) => ({
      ...file,
      content: previewLines(file.content).slice(0, CARD_PREVIEW_LINES).join("\n"),
    })),
  )
  return Object.fromEntries(
    highlighted.map((file) => [
      file.slug,
      file.lines ?? file.content.split("\n").map((line) => [line]),
    ]),
  )
}
