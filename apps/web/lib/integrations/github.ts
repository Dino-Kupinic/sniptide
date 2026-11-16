import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"
import { byteLength, formatLimit } from "@/lib/format"
import type { Failure, ImportFile, ImportItem, ImportSource, IntegrationProvider } from "./types"

// GitHub: importing gists. A gist link reads without a connection, and a connected account also
// lists its own gists, secret ones included.

const API = "https://api.github.com"
const GIST_LINK = /([0-9a-f]{20,40})\/?(?:#.*)?$/i
const RAW_HOST = "gist.githubusercontent.com"
const AVATAR_HOST = "avatars.githubusercontent.com"
const MAX_NAME = 120
const PAGE_SIZE = 30

const fileSchema = z.object({
  filename: z.string(),
  size: z.number().optional(),
  raw_url: z.string().optional(),
  content: z.string().optional(),
  truncated: z.boolean().optional(),
})

const gistSchema = z.object({
  description: z.string().nullable(),
  owner: z.object({ login: z.string(), avatar_url: z.string().optional() }).nullish(),
  files: z.record(z.string(), fileSchema),
})

const listSchema = z.array(
  z.object({
    id: z.string(),
    description: z.string().nullable(),
    public: z.boolean(),
    updated_at: z.string().optional(),
    files: z.record(z.string(), z.object({ filename: z.string() })),
  }),
)

function isHttps(value: string | undefined, host: string): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === host
  } catch {
    return false
  }
}

function describeFile(file: z.infer<typeof fileSchema>, limit: number): ImportFile {
  const inline = file.content !== undefined && !file.truncated
  const size = inline ? byteLength(file.content ?? "") : (file.size ?? 0)
  // GitHub marks a file over 1 MB as truncated and serves its text from the raw host.
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

function request(path: string, token: string | null, init?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "sniptide",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
}

const unanswered: Failure = { ok: false, error: "GitHub didn't answer. Try again in a minute." }
const refused: Failure = {
  ok: false,
  error: "GitHub no longer accepts this connection.",
  unauthorized: true,
}

const gists: ImportSource = {
  parseId(input) {
    return input.trim().match(GIST_LINK)?.[1] ?? null
  },

  // Without a connection the server's own GITHUB_TOKEN raises GitHub's rate limit, when it is set.
  async fetch(id, token) {
    const { githubToken, maxPasteBytes } = getConfig()
    const response = await request(`/gists/${id}`, token ?? githubToken ?? null)
    if (response?.status === 401 && token) return refused
    if (response?.status === 404)
      return { ok: false, error: "That gist doesn't exist or isn't public." }
    if (!response?.ok) return unanswered

    const gist = gistSchema.safeParse(await response.json().catch(() => null))
    if (!gist.success) return { ok: false, error: "That gist couldn't be read." }

    const files = Object.values(gist.data.files).map((file) => describeFile(file, maxPasteBytes))
    if (files.length === 0) return { ok: false, error: "That gist has no files." }

    const owner = gist.data.owner
    const item: ImportItem = {
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
    }
    return { ok: true, item }
  },

  async list(token, page) {
    const response = await request(`/gists?per_page=${PAGE_SIZE}&page=${page}`, token)
    if (response?.status === 401) return refused
    if (!response?.ok) return unanswered
    const list = listSchema.safeParse(await response.json().catch(() => null))
    if (!list.success) return unanswered
    return {
      ok: true,
      items: list.data.map((gist) => {
        const names = Object.values(gist.files).map((file) => file.filename)
        return {
          id: gist.id,
          title: (gist.description?.trim() || names[0] || gists.fallbackTitle).slice(0, MAX_NAME),
          files: names.length,
          public: gist.public,
          updatedAt: gist.updated_at ?? null,
        }
      }),
      nextPage: list.data.length === PAGE_SIZE ? page + 1 : null,
    }
  },

  fallbackTitle: "Imported gist",
  describe: (item) => `Imported from gist ${item.id}`,
}

export const github: IntegrationProvider = {
  id: "github",
  name: "GitHub",
  oauth: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // GitHub has no read-only gist scope. `gist` is what lists secret gists.
    scopes: ["gist"],
    // The OAuth app that GitHub sign-in uses, so connecting needs no settings of its own.
    credentials: () => getConfig().github ?? null,
    // GitHub only redirects below the app's registered callback URL, which is the sign-in
    // callback at /api/auth/callback/github.
    callbackPath: "/api/auth/callback/github/integration",
  },

  async account(token) {
    const response = await request("/user", token)
    if (!response?.ok) return null
    const user = z
      .object({ id: z.number(), login: z.string() })
      .safeParse(await response.json().catch(() => null))
    return user.success ? { id: String(user.data.id), name: user.data.login } : null
  },

  // Deletes this one token. The grant stays, because GitHub sign-in shares the OAuth app.
  async revoke(token, { clientId, clientSecret }) {
    await request(`/applications/${encodeURIComponent(clientId)}/token`, null, {
      method: "DELETE",
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ access_token: token }),
    })
  },

  imports: gists,
}
