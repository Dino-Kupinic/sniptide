import "server-only"

import { pasteFile } from "@workspace/db/schema"
import { asc, eq } from "drizzle-orm"
import { getDb } from "@/lib/db"

import { getLanguage } from "@/lib/pastes/languages"
import { isLive, openToAnyone } from "@/lib/pastes/lifecycle"
import { findOwned } from "@/lib/pastes/records"
import { getProvider } from "./providers"
import { accessToken, removeConnection } from "./store"
import type { ExportDestination, ExportFile, ExportPaste, ExportTarget, Failure } from "./types"

// Sending a paste out of Sniptide: the content policy, and the calls to a provider's exports with
// the user's connection. Every destination copies data to a service with its own access rules, so
// what may leave is decided here once, not in each adapter.

const unknown: Failure = { ok: false, error: "That integration isn't set up on this server." }
const unavailable: Failure = { ok: false, error: "That paste can't be sent anywhere." }
const disconnected: Failure = {
  ok: false,
  error: "That connection stopped working. Connect it again in Settings.",
}

interface PolicyFields {
  visibility: "public" | "unlisted" | "private"
  passwordHash: string | null
  burnAfterRead: boolean
  encryptionKeyId: string | null
}

// What a destination may show of a paste. "details" adds the title and language to the link, for
// a paste anyone with the link can read. "link" is the link alone, for a private,
// password-protected or burn-after-read paste, whose title may be as private as its content. An
// encrypted paste can't be sent: its link needs the key from the fragment, which the server never
// sees.
export function exportReveal(paste: PolicyFields): "details" | "link" | null {
  if (paste.encryptionKeyId) return null
  return openToAnyone(paste) ? "details" : "link"
}

async function readFiles(pasteId: string): Promise<ExportFile[]> {
  const rows = await getDb()
    .select({ name: pasteFile.name, language: pasteFile.language, content: pasteFile.content })
    .from(pasteFile)
    .where(eq(pasteFile.pasteId, pasteId))
    .orderBy(asc(pasteFile.position))
  return rows.map((row) => ({ ...row, language: getLanguage(row.language).name }))
}

export function exportTarget(provider: string): ExportTarget | null {
  return getProvider(provider)?.exports ?? null
}

// Runs a call with the user's token. A token the provider refuses removes the connection, so
// Settings and the Share dialog show it as not connected.
async function withToken<T extends { ok: true }>(
  provider: string,
  userId: string,
  run: (target: ExportTarget, token: string) => Promise<T | Failure>,
): Promise<T | Failure> {
  const target = exportTarget(provider)
  if (!target) return unknown
  const token = await accessToken(userId, provider)
  if (!token) return disconnected
  const result = await run(target, token)
  if (result.ok || !result.unauthorized) return result
  await removeConnection(userId, provider)
  return disconnected
}

export function listDestinations(
  provider: string,
  userId: string,
): Promise<{ ok: true; destinations: ExportDestination[] } | Failure> {
  return withToken(provider, userId, (target, token) => target.destinations(token))
}

// Sends one of the viewer's own pastes. `origin` builds the link the destination receives.
export async function sendPaste(
  provider: string,
  userId: string,
  slug: string,
  destination: string,
  origin: string,
): Promise<{ ok: true } | Failure> {
  const record = await findOwned(slug)
  if (!record || !isLive(record)) return unavailable
  const reveal = exportReveal(record)
  if (!reveal) return unavailable
  const target = exportTarget(provider)
  const details = reveal === "details"
  const paste: ExportPaste = {
    url: `${origin}/${encodeURIComponent(record.slug)}`,
    title: details ? record.title : null,
    // The display name, such as "Markdown", rather than the stored id.
    language: details && record.firstLanguage ? getLanguage(record.firstLanguage).name : null,
    files: details && target?.content ? await readFiles(record.id) : null,
  }
  return withToken(provider, userId, (target, token) => target.send(token, destination, paste))
}
