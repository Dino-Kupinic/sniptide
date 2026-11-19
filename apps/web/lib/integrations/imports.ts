import "server-only"

import { getConfig } from "@/lib/config"
import { byteLength, formatLimit } from "@/lib/format"
import { getProvider } from "./providers"
import { accessToken, removeConnection } from "./store"
import type { Failure, ImportFile, ImportItem, ImportSource, ImportSummary } from "./types"

// Importing from a provider: reading an item and its files, and listing what the connected
// account has. The import sheet and "Open in editor" on the new paste page both come through here.

const MAX_NAME = 120

const unknown: Failure = { ok: false, error: "That import source isn't available." }

export function importSource(provider: string): ImportSource | null {
  return getProvider(provider)?.imports ?? null
}

// Reads one item with the user's connection when there is one. A connection the provider no
// longer accepts is removed, and the read goes ahead without it, as it would for a user who never
// connected.
export async function fetchImport(
  provider: string,
  userId: string,
  id: string,
): Promise<{ ok: true; item: ImportItem } | Failure> {
  const source = importSource(provider)
  if (!source) return unknown
  const token = await accessToken(userId, provider)
  const result = await source.fetch(id, token)
  if (result.ok || !result.unauthorized || !token) return result
  await removeConnection(userId, provider)
  return source.fetch(id, null)
}

export type ImportList =
  | { ok: true; connected: true; items: ImportSummary[]; nextPage: number | null }
  | { ok: true; connected: false }
  | Failure

// The connected account's own items. `connected: false` when the user has no usable connection.
export async function listImports(
  provider: string,
  userId: string,
  page: number,
): Promise<ImportList> {
  const source = importSource(provider)
  if (!source) return unknown
  const token = await accessToken(userId, provider)
  if (!token) return { ok: true, connected: false }
  const result = await source.list(token, page)
  if (result.ok) return { ...result, connected: true }
  if (!result.unauthorized) return result
  await removeConnection(userId, provider)
  return { ok: true, connected: false }
}

interface DownloadBudget {
  remaining: number
  exceeded: boolean
  controller: AbortController
}

async function fetchRaw(url: string, limit: number, budget: DownloadBudget) {
  const response = await fetch(url, {
    signal: AbortSignal.any([AbortSignal.timeout(10_000), budget.controller.signal]),
  }).catch(() => null)
  if (!response?.ok) {
    if (response?.body) void response.body.cancel().catch(() => {})
    return null
  }
  if (!response.body) return ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let bytes = 0
  let rawBytes = 0
  let complete = false
  const append = (text: string) => {
    const size = byteLength(text)
    if (!size) return true
    if (bytes + size > limit) return false
    if (size > budget.remaining) {
      budget.exceeded = true
      budget.controller.abort()
      return false
    }
    bytes += size
    budget.remaining -= size
    chunks.push(text)
    return true
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        if (!append(decoder.decode())) return null
        complete = true
        return chunks.join("")
      }
      rawBytes += value.byteLength
      // Decoding removes an initial UTF-8 BOM, which does not count towards the paste size.
      if (rawBytes > limit + 3 || !append(decoder.decode(value, { stream: true }))) return null
    }
  } catch {
    return null
  } finally {
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export type ImportedFiles =
  | { ok: true; files: { name: string; content: string }[] }
  | { ok: false; error: string }

// The text of the named files, fetching the ones the provider didn't send inline. Refuses names
// the item no longer has and files that can't be imported.
export async function readImportFiles(item: ImportItem, names: string[]): Promise<ImportedFiles> {
  const chosen: ImportFile[] = []
  for (const name of new Set(names)) {
    const file = item.files.find((candidate) => candidate.name === name)
    if (!file) return { ok: false, error: "That gist changed. Paste the link again to re-read it." }
    if (file.skipped) return { ok: false, error: `${file.name}: ${file.skipped}` }
    chosen.push(file)
  }

  const { maxPasteBytes } = getConfig()
  const tooLarge = {
    ok: false as const,
    error: `Pastes are limited to ${formatLimit(maxPasteBytes)}.`,
  }
  const budget: DownloadBudget = {
    remaining: maxPasteBytes,
    exceeded: false,
    controller: new AbortController(),
  }
  for (const file of chosen) {
    if (file.content !== null) budget.remaining -= byteLength(file.content)
  }
  if (budget.remaining < 0) return tooLarge
  const files = chosen.map((file) => ({ name: file.name, content: file.content }))
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(2, chosen.length) }, async () => {
      while (next < chosen.length && !budget.exceeded) {
        const index = next++
        const file = chosen[index]
        if (file?.content === null && file.rawUrl) {
          files[index] = {
            name: file.name,
            content: await fetchRaw(file.rawUrl, maxPasteBytes, budget),
          }
        }
      }
    }),
  )
  if (budget.exceeded) return tooLarge
  for (const file of files) {
    if (file.content === null)
      return { ok: false, error: `${file.name} couldn't be read from GitHub.` }
  }
  return {
    ok: true,
    files: files.map((file) => ({ name: file.name, content: file.content ?? "" })),
  }
}

// What a paste made from the item is called.
export function importTitle(source: ImportSource, item: ImportItem, firstFile?: string) {
  return (item.description || firstFile || source.fallbackTitle).slice(0, MAX_NAME)
}
