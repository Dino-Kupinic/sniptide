// The .env parser the CLI and the web app share, so a file reads the same on both sides of
// `sniptide env`. Free of Zod, so the CLI bundles only this file.

export interface DotenvVariable {
  name: string
  value: string
}

function unescapeDouble(value: string) {
  return value.replace(/\\([nrt"\\$])/g, (_, char: string) =>
    char === "n" ? "\n" : char === "r" ? "\r" : char === "t" ? "\t" : char,
  )
}

// Parses .env syntax as dotenv does: `KEY=value`, an optional `export `, `#` comments, single
// quotes taken literally, double quotes with \n escapes and line breaks, and unquoted values
// trimmed with any ` #comment` dropped. Variables are not expanded. A later duplicate wins, in
// the position of the first. `Failure` is the caller's own error class.
export function parseDotenv(
  text: string,
  Failure: new (message: string) => Error = Error,
): DotenvVariable[] {
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
    if (!match) throw new Failure(`Can't read line ${start} of the .env file.`)
    const name = match[1] as string
    let rest = match[2] as string
    let value: string
    const quote = rest[0]
    if (quote === '"' || quote === "'" || quote === "`") {
      // A quoted value can continue over the following lines until its closing quote.
      let body = rest.slice(1)
      let close = findClose(body, quote)
      while (close === -1 && index < source.length) {
        const next = source.indexOf("\n", index)
        body += `\n${source.slice(index, next === -1 ? source.length : next)}`
        index = next === -1 ? source.length : next + 1
        line++
        close = findClose(body, quote)
      }
      if (close === -1) throw new Failure(`Unclosed quote in line ${start} of the .env file.`)
      const after = body.slice(close + 1).trim()
      if (after && !after.startsWith("#"))
        throw new Failure(`Unexpected text after a quoted value in line ${start}.`)
      value = body.slice(0, close)
      if (quote === '"') value = unescapeDouble(value)
    } else {
      const comment = rest.search(/\s#/)
      if (comment !== -1) rest = rest.slice(0, comment)
      value = rest.trim()
    }
    variables.set(name, value)
  }
  return [...variables].map(([name, value]) => ({ name, value }))
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
