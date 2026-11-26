// Spam heuristics that need no provider: link farms, link shorteners, repeated lines and the
// vocabulary of SEO and gambling spam. Each signal adds to a score, and a score at or above
// SPAM_REVIEW_SCORE sends the paste to the review queue. The heuristics never restrict a paste on
// their own, because code and logs repeat lines and link to many places for good reasons.

export const SPAM_REVIEW_SCORE = 5

const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
  "rb.gy",
  "t.ly",
  "s.id",
  "tiny.cc",
])
const SPAM_TERMS =
  /\b(casino|betting|slot (?:online|gacor)|viagra|cialis|escort|onlyfans leak|buy (?:followers|likes|backlinks)|crypto (?:giveaway|airdrop)|free (?:robux|v-?bucks)|seo (?:service|backlinks)|watch .{0,40} (?:full movie|online free)|loan approval|payday loan)\b/gi

export interface SpamVerdict {
  score: number
  reasons: string[]
}

export function spamVerdict(text: string, urls: string[]): SpamVerdict {
  const reasons: string[] = []
  let score = 0
  const hosts = urls.flatMap((url) => {
    try {
      return [new URL(url).hostname.replace(/^www\./, "")]
    } catch {
      return []
    }
  })
  const words = text.split(/\s+/).filter(Boolean).length || 1
  if (urls.length >= 20) {
    score += 2
    reasons.push(`${urls.length} links`)
  }
  // More than one link for every 15 words reads as a link list rather than code or prose.
  if (urls.length >= 5 && urls.length / words > 1 / 15) {
    score += 2
    reasons.push("dense links")
  }
  const shortened = hosts.filter((host) => SHORTENERS.has(host)).length
  if (shortened >= 2) {
    score += 2
    reasons.push(`${shortened} shortened links`)
  }
  const terms = new Set((text.match(SPAM_TERMS) ?? []).map((term) => term.toLowerCase()))
  if (terms.size) {
    score += Math.min(4, terms.size * 2)
    reasons.push(`spam terms: ${[...terms].slice(0, 5).join(", ")}`)
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 20)
  if (lines.length >= 10) {
    const counts = new Map<string, number>()
    for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)
    const top = Math.max(...counts.values())
    // The same long line making up half of a paste, and it carries a link or a spam term.
    if (top / lines.length >= 0.5 && (urls.length > 0 || terms.size > 0)) {
      score += 2
      reasons.push("repeated lines")
    }
  }
  return { score, reasons }
}
