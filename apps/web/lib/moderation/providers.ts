// The screening providers. OpenAI's moderation endpoint is the primary text check, Mistral's is
// the fallback when OpenAI fails or has no key, and Google Web Risk looks up links. Only text is
// sent: content.ts removes images first. Providers get no account, owner or paste identifier.

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface TextVerdict {
  provider: "openai" | "mistral"
  model: string
  flagged: string[]
  scores: Record<string, number>
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | "network",
  ) {
    super(`${provider}: ${status}`)
    this.name = "ProviderError"
  }
}

const TIMEOUT_MS = 15_000
// Inputs per request. Both endpoints take an array, and smaller batches keep one slow request
// from holding a whole paste.
const BATCH = 16
const OPENAI_MODEL = "omni-moderation-latest"
const MISTRAL_MODEL = "mistral-moderation-latest"

async function post(fetcher: Fetcher, provider: string, url: string, key: string, body: unknown) {
  let response: Response
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ProviderError(provider, "network")
  }
  if (!response.ok) throw new ProviderError(provider, response.status)
  return (await response.json()) as unknown
}

type Result = {
  flagged?: boolean
  categories?: Record<string, boolean>
  category_scores?: Record<string, number>
}

// Merges per-chunk results: a category counts as flagged if any chunk flags it, at its highest score.
function merge(provider: TextVerdict["provider"], model: string, results: Result[]): TextVerdict {
  const scores: Record<string, number> = {}
  const flagged = new Set<string>()
  for (const result of results) {
    for (const [category, score] of Object.entries(result.category_scores ?? {}))
      scores[category] = Math.max(scores[category] ?? 0, Number(score) || 0)
    for (const [category, hit] of Object.entries(result.categories ?? {}))
      if (hit) flagged.add(category)
  }
  return { provider, model, flagged: [...flagged].sort(), scores }
}

async function moderate(
  fetcher: Fetcher,
  provider: TextVerdict["provider"],
  url: string,
  model: string,
  key: string,
  chunks: string[],
  format: (chunk: string) => unknown,
) {
  const results: Result[] = []
  for (let start = 0; start < chunks.length; start += BATCH) {
    const input = chunks.slice(start, start + BATCH).map(format)
    const body = (await post(fetcher, provider, url, key, { model, input })) as {
      results?: Result[]
    }
    if (!Array.isArray(body.results) || body.results.length !== input.length)
      throw new ProviderError(provider, 502)
    results.push(...body.results)
  }
  return merge(provider, model, results)
}

export function moderateWithOpenAI(fetcher: Fetcher, key: string, chunks: string[]) {
  return moderate(
    fetcher,
    "openai",
    "https://api.openai.com/v1/moderations",
    OPENAI_MODEL,
    key,
    chunks,
    // Text parts only. The endpoint also takes images, which screening never sends.
    (text) => ({ type: "text", text }),
  )
}

export function moderateWithMistral(fetcher: Fetcher, key: string, chunks: string[]) {
  return moderate(
    fetcher,
    "mistral",
    "https://api.mistral.ai/v1/moderations",
    MISTRAL_MODEL,
    key,
    chunks,
    (text) => text,
  )
}

// Links looked up per paste. The rest are counted as unchecked in the result, and a paste full of
// links also scores on the spam heuristics.
const MAX_LINKS = 25
const THREATS = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]

// Looks each link up in Google Web Risk's threat lists. The link itself is never fetched.
export async function lookUpLinks(fetcher: Fetcher, key: string, urls: string[]) {
  const checked = urls.slice(0, MAX_LINKS)
  const threats = new Set<string>()
  for (const url of checked) {
    const query = new URLSearchParams({ uri: url, key })
    for (const threat of THREATS) query.append("threatTypes", threat)
    let response: Response
    try {
      response = await fetcher(`https://webrisk.googleapis.com/v1/uris:search?${query}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new ProviderError("web_risk", "network")
    }
    if (!response.ok) throw new ProviderError("web_risk", response.status)
    const body = (await response.json()) as { threat?: { threatTypes?: string[] } }
    for (const type of body.threat?.threatTypes ?? []) threats.add(type)
  }
  return {
    checked: checked.length,
    unchecked: urls.length - checked.length,
    threats: [...threats].sort(),
  }
}
