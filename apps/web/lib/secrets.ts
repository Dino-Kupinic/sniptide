// Patterns for credentials people paste by accident. Deliberately specific to keep false
// alarms rare; it's a warning in the editor, not a gate.
const patterns: { name: string; pattern: RegExp }[] = [
  { name: "a private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "an AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: "a GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/,
  },
  { name: "a Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "a Stripe live key", pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/ },
  { name: "an OpenAI or Anthropic key", pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: "a Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
]

export interface SecretMatch {
  name: string
  file: string
  line: number
}

const matches = new WeakMap<object, { content: string; match: Omit<SecretMatch, "file"> | null }>()

export function findSecrets(files: { name: string; content: string }[]): SecretMatch | null {
  for (const file of files) {
    let cached = matches.get(file)
    if (!cached || cached.content !== file.content) {
      let match: Omit<SecretMatch, "file"> | null = null
      let start = 0
      let lineNumber = 1
      while (start <= file.content.length) {
        const end = file.content.indexOf("\n", start)
        const line = file.content.slice(start, end === -1 ? undefined : end)
        const hit = patterns.find(({ pattern }) => pattern.test(line))
        if (hit) {
          match = { name: hit.name, line: lineNumber }
          break
        }
        if (end === -1) break
        start = end + 1
        lineNumber++
      }
      cached = { content: file.content, match }
      matches.set(file, cached)
    }
    if (cached.match) return { ...cached.match, file: file.name }
  }
  return null
}
