import { MAX_GROUP_BYTES, type Variable, variablesSchema } from "./inputs"

function unescapeDouble(value: string) {
  return value.replace(/\\([nrt"\\$])/g, (_, char: string) =>
    char === "n" ? "\n" : char === "r" ? "\r" : char === "t" ? "\t" : char,
  )
}

export function parseEnvFile(text: string): Variable[] {
  if (new TextEncoder().encode(text).length > MAX_GROUP_BYTES)
    throw new Error("The env file is too large.")
  const variables = new Map<string, string>()
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  let index = 0
  let line = 1
  while (index < source.length) {
    const end = source.indexOf("\n", index)
    const raw = source.slice(index, end === -1 ? source.length : end)
    const start = line
    index = end === -1 ? source.length : end + 1
    line++
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/s.exec(trimmed)
    if (!match) throw new Error(`Can't read line ${start} of the .env file.`)
    const name = match[1] ?? ""
    let rest = match[2] ?? ""
    let value: string
    const quote = rest[0]
    if (quote === '"' || quote === "'" || quote === "`") {
      let body = rest.slice(1)
      let close = findClose(body, quote)
      while (close === -1 && index < source.length) {
        const next = source.indexOf("\n", index)
        body += `\n${source.slice(index, next === -1 ? source.length : next)}`
        index = next === -1 ? source.length : next + 1
        line++
        close = findClose(body, quote)
      }
      if (close === -1) throw new Error(`Unclosed quote in line ${start} of the .env file.`)
      const after = body.slice(close + 1).trim()
      if (after && !after.startsWith("#"))
        throw new Error(`Unexpected text after a quoted value in line ${start}.`)
      value = body.slice(0, close)
      if (quote === '"') value = unescapeDouble(value)
    } else {
      const comment = rest.search(/\s#/)
      if (comment !== -1) rest = rest.slice(0, comment)
      value = rest.trim()
    }
    variables.set(name, value)
  }
  return variablesSchema.parse([...variables].map(([name, value]) => ({ name, value })))
}

function findClose(body: string, quote: string) {
  for (let i = 0; i < body.length; i++) {
    if (quote === '"' && body[i] === "\\") {
      i++
      continue
    }
    if (body[i] === quote) return i
  }
  return -1
}
