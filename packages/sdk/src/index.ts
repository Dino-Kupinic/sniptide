export type Visibility = "public" | "unlisted" | "private"
export interface Source {
  repository: string | null
  commit: string | null
  dirty: boolean
}
export interface CodeFile {
  name: string
  content: string
  language: string
  lines?: { start: number; end: number }
}
export interface CaptureInput {
  title: string
  files: Array<Omit<CodeFile, "language"> & { language?: string }>
  description?: string
  visibility?: Visibility
  collection?: string | null
  tags?: string[]
  source?: Source | null
}
export interface Paste {
  id: string
  slug: string
  url: string
  title: string
  description: string
  visibility: Visibility
  collection: string | null
  tags: string[]
  source: Source | null
  files: CodeFile[]
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}
export type PasteSummary = Omit<Paste, "files"> & { languages: string[]; bytes: number }
export interface Page<T> {
  pastes: T[]
  nextCursor: string | null
}
export interface Collection {
  slug: string
  name: string
  pasteCount: number
}
export interface ListOptions {
  q?: string
  tag?: string[]
  language?: string
  collection?: string
  limit?: number
  cursor?: string
}
export interface SettingsInput {
  visibility?: Visibility
  expiry?: "1h" | "1d" | "1w" | "1m" | "1y" | "never"
  password?: string | null
  burnAfterRead?: boolean
}
export interface Settings {
  visibility: Visibility
  expiresAt: string | null
  passwordProtected: boolean
  burnAfterRead: boolean
}
export interface Usage {
  storageBytes: number
  pasteCount: number
  fileCount: number
  collectionCount: number
  reconciledAt: string
  apiRequests: Array<{ tokenId: string; day: number; requests: number }>
}
export interface EnvVariable {
  name: string
  value: string
}
export interface EnvGroup {
  slug: string
  updatedAt: string
  variables: EnvVariable[]
}
export interface EnvGroupSummary {
  slug: string
  variables: number
  createdAt: string
  updatedAt: string
}
export class SniptideError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public retryAfter?: string | null,
  ) {
    super(message)
    this.name = "SniptideError"
  }
}
const MAX_RESPONSE = 64 * 1024 * 1024
function base(value: string): string {
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new TypeError(
      "Base URL must use HTTPS (or HTTP on loopback) and have no credentials, query or fragment.",
    )
  return url.href.replace(/\/+$/, "")
}
function segment(value: string): string {
  if (!value || value === "." || value === "..") throw new TypeError("Invalid identifier.")
  return encodeURIComponent(value)
}
export class SniptideClient {
  private readonly baseUrl: string
  constructor(
    private readonly token: string,
    baseUrl = "https://app.sniptide.com",
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly maxResponseBytes = MAX_RESPONSE,
  ) {
    if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0)
      throw new TypeError("maxResponseBytes must be a positive integer.")
    this.baseUrl = base(baseUrl)
    if (!token || /[\r\n]/.test(token)) throw new TypeError("A valid token is required.")
  }
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}/api/v1/${path}`, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new SniptideError("Cannot reach Sniptide.", undefined, "network_error")
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      throw new SniptideError("Sniptide redirected the request.", response.status, "redirect")
    }
    let value: unknown
    try {
      if (!response.body) throw new Error()
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          if (size > this.maxResponseBytes) {
            await reader.cancel()
            throw new Error()
          }
          chunks.push(part.value)
        }
      } finally {
        reader.releaseLock()
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error()
    } catch {
      throw new SniptideError(
        "Sniptide returned an invalid or oversized response.",
        response.status,
        "invalid_response",
        response.headers.get("retry-after"),
      )
    }
    if (!response.ok) {
      const error = value as Record<string, unknown>
      throw new SniptideError(
        typeof error.message === "string" ? error.message : `HTTP ${response.status}`,
        response.status,
        typeof error.code === "string" ? error.code : undefined,
        response.headers.get("retry-after"),
      )
    }
    return value as T
  }
  me() {
    return this.request<{
      user: { id: string; name: string; username: string | null }
      scopes: string[]
    }>("me")
  }
  usage() {
    return this.request<Usage>("usage")
  }
  listPastes(options: ListOptions = {}) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(options)) {
      if (Array.isArray(value)) for (const item of value) query.append(key, item)
      else if (value !== undefined) query.set(key, String(value))
    }
    return this.request<Page<PasteSummary>>(`pastes${query.toString() ? `?${query}` : ""}`)
  }
  readPaste(id: string) {
    return this.request<{ paste: Paste }>(`pastes/${segment(id)}`)
  }
  createPaste(input: CaptureInput, idempotencyKey?: string) {
    return this.request<{ paste: Paste }>("pastes", "POST", input, idempotencyKey)
  }
  updatePaste(id: string, input: Pick<CaptureInput, "title" | "files">) {
    return this.request<{ paste: Paste }>(`pastes/${segment(id)}`, "PUT", input)
  }
  updateSettings(id: string, input: SettingsInput) {
    return this.request<{ paste: Omit<Paste, "files">; settings: Settings }>(
      `pastes/${segment(id)}`,
      "PATCH",
      input,
    )
  }
  trashPaste(id: string) {
    return this.request<{ trashed: { id: string; slug: string } }>(
      `pastes/${segment(id)}`,
      "DELETE",
    )
  }
  listEnvGroups() {
    return this.request<{ groups: EnvGroupSummary[] }>("env")
  }
  readEnvGroup(group: string) {
    return this.request<{ group: EnvGroup }>(`env/${segment(group)}`)
  }
  writeEnvGroup(group: string, variables: EnvVariable[]) {
    return this.request<{ group: EnvGroup }>(`env/${segment(group)}`, "PUT", { variables })
  }
  deleteEnvGroup(group: string) {
    return this.request<{ ok: true }>(`env/${segment(group)}`, "DELETE")
  }
  listCollections() {
    return this.request<{ collections: Collection[] }>("collections")
  }
  createCollection(name: string, idempotencyKey?: string) {
    return this.request<{ collection: Collection }>("collections", "POST", { name }, idempotencyKey)
  }
  collectionPastes(slug: string, cursor?: string) {
    const query = cursor === undefined ? "" : `?${new URLSearchParams({ cursor })}`
    return this.request<Page<Paste>>(`collections/${segment(slug)}/pastes${query}`)
  }
}
