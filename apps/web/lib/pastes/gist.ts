import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"
import { byteLength, formatLimit } from "@/lib/format"

// Reading public GitHub gists, for the import sheet and for starting a new paste from one.

const GIST_LINK = /([0-9a-f]{20,40})\/?(?:#.*)?$/i
const RAW_HOST = "gist.githubusercontent.com"
const AVATAR_HOST = "avatars.githubusercontent.com"
export const MAX_NAME = 120

// The id in a gist URL, or a bare id. Null for anything else.
export function parseGistId(input: string) {
  return input.trim().match(GIST_LINK)?.[1] ?? null
}

const gistSchema = z.object({
  description: z.string().nullable(),
  updated_at: z.string().optional(),
  owner: z.object({ login: z.string(), avatar_url: z.string().optional() }).nullish(),
  files: z.record(
    z.string(),
    z.object({
      filename: z.string(),
      size: z.number().optional(),
      raw_url: z.string().optional(),
      content: z.string().optional(),
      truncated: z.boolean().optional(),
    }),
  ),
})

export type GistFile = {
  name: string
  size: number
  // Inline text, when GitHub sent the whole file.
  content: string | null
  // Where to fetch the whole file when GitHub marked it truncated (over 1 MB inline).
  rawUrl: string | null
  // Why the file can't be imported, or null.
  skipped: string | null
}

export type GistOwner = { login: string; avatarUrl: string | null; url: string }

export type Gist = {
  id: string
  owner: GistOwner | null
  description: string | null
  files: GistFile[]
}

function isHttps(value: string | undefined, host: string): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === host
  } catch {
    return false
  }
}

function describeFile(file: z.infer<typeof gistSchema>["files"][string], limit: number): GistFile {
  const inline = file.content !== undefined && !file.truncated
  const size = inline ? byteLength(file.content ?? "") : (file.size ?? 0)
  const rawUrl = !inline && isHttps(file.raw_url, RAW_HOST) ? file.raw_url : null

  let skipped: string | null = null
  if (file.filename.length > MAX_NAME) skipped = `Name is over ${MAX_NAME} characters.`
  else if (size > limit) skipped = `Over the ${formatLimit(limit)} limit.`
  else if (!inline && !rawUrl) skipped = "Couldn't be read."

  return {
    name: file.filename,
    size,
    content: inline ? (file.content ?? "") : null,
    rawUrl,
    skipped,
  }
}

export type FetchGist = { ok: true; gist: Gist } | { ok: false; error: string }

export async function fetchGist(id: string): Promise<FetchGist> {
  const { githubToken, maxPasteBytes } = getConfig()
  const response = await fetch(`https://api.github.com/gists/${id}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "sniptide",
      ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (response?.status === 404)
    return { ok: false, error: "That gist doesn't exist or isn't public." }
  if (!response?.ok) return { ok: false, error: "GitHub didn't answer. Try again in a minute." }

  const gist = gistSchema.safeParse(await response.json().catch(() => null))
  if (!gist.success) return { ok: false, error: "That gist couldn't be read." }

  const files = Object.values(gist.data.files).map((file) => describeFile(file, maxPasteBytes))
  if (files.length === 0) return { ok: false, error: "That gist has no files." }

  const owner = gist.data.owner
  return {
    ok: true,
    gist: {
      id,
      owner: owner
        ? {
            login: owner.login,
            avatarUrl: isHttps(owner.avatar_url, AVATAR_HOST) ? owner.avatar_url : null,
            url: `https://github.com/${encodeURIComponent(owner.login)}`,
          }
        : null,
      description: gist.data.description?.trim() || null,
      files,
    },
  }
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

export type GistFiles =
  | { ok: true; files: { name: string; content: string }[] }
  | { ok: false; error: string }

// The text of the named files, fetching the ones GitHub truncated. Refuses names the gist no
// longer has and files that can't be imported.
export async function readGistFiles(gist: Gist, names: string[]): Promise<GistFiles> {
  const chosen: GistFile[] = []
  for (const name of new Set(names)) {
    const file = gist.files.find((candidate) => candidate.name === name)
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

// What a paste made from the gist is called and says about itself.
export function gistTitle(gist: Gist, firstFile?: string) {
  return (gist.description || firstFile || "Imported gist").slice(0, MAX_NAME)
}

export const gistDescription = (gist: Gist) => `Imported from gist ${gist.id}`
