import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, open, rename, rm } from "node:fs/promises"
import { constants as os } from "node:os"
import path from "node:path"
import type { Api } from "./api"
import { record, string } from "./contract"
import { CliError, isMissing } from "./errors"

// `sniptide env`: sync a project's .env file with an env group on Sniptide (WRK-111), and run
// commands with its variables injected. Values only ever travel to the configured instance and
// into files written owner-only; they are never printed except by `env pull --stdout`.

export interface Variable {
  name: string
  value: string
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,255}$/
export const GROUP = /^[a-z0-9][a-z0-9._-]{0,63}$/
const MAX_FILE_BYTES = 1024 * 1024

export function groupName(value: string | undefined): string {
  if (!value || !GROUP.test(value))
    throw new CliError("Name the env group: 1–64 lowercase letters, digits, dots, - and _.")
  return value
}

function unescapeDouble(value: string) {
  return value.replace(/\\([nrt"\\$])/g, (_, char: string) =>
    char === "n" ? "\n" : char === "r" ? "\r" : char === "t" ? "\t" : char,
  )
}

// Parses .env syntax as dotenv does: `KEY=value`, an optional `export `, `#` comments, single
// quotes taken literally, double quotes with \n escapes and line breaks, and unquoted values
// trimmed with any ` #comment` dropped. Variables are not expanded. A later duplicate wins, in
// the position of the first.
export function parseDotenv(text: string): Variable[] {
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
    if (!match) throw new CliError(`Can't read line ${start} of the .env file.`)
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
      if (close === -1) throw new CliError(`Unclosed quote in line ${start} of the .env file.`)
      const after = body.slice(close + 1).trim()
      if (after && !after.startsWith("#"))
        throw new CliError(`Unexpected text after a quoted value in line ${start}.`)
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

// Writes variables back as .env lines that parseDotenv (and dotenv) read as the same values.
export function serializeDotenv(variables: Variable[]): string {
  return variables
    .map(({ name, value }) => {
      if (/^[A-Za-z0-9_./:@%+,=-]*$/.test(value)) return `${name}=${value}`
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
      return `${name}="${escaped}"`
    })
    .map((line) => `${line}\n`)
    .join("")
}

function parseGroup(data: Record<string, unknown>) {
  const group = record(data.group)
  if (!Array.isArray(group.variables))
    throw new CliError("Invalid env group response.", "INVALID_RESPONSE", 1)
  const variables = group.variables.map((item) => {
    const entry = record(item)
    const name = string(entry.name, "variable name")
    if (!NAME.test(name) || typeof entry.value !== "string")
      throw new CliError("Invalid env group response.", "INVALID_RESPONSE", 1)
    return { name, value: entry.value }
  })
  return { slug: string(group.slug, "group"), variables }
}

export async function fetchGroup(api: Api, group: string) {
  return parseGroup(await api.request(`env/${encodeURIComponent(group)}`))
}

export async function pushGroup(api: Api, group: string, variables: Variable[]) {
  return parseGroup(await api.request(`env/${encodeURIComponent(group)}`, { variables }, "PUT"))
}

export async function readEnvFile(filename: string): Promise<Variable[]> {
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if (isMissing(error)) throw new CliError(`There is no ${path.basename(filename)} to push.`)
    throw error
  }
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_FILE_BYTES)
      throw new CliError("The env file must be a regular file smaller than 1 MiB.")
    return parseDotenv(await handle.readFile("utf8"))
  } finally {
    await handle.close()
  }
}

// Writes the .env file owner-only (0600), through a temporary file so a reader never sees half of
// it. An existing file is only replaced with `force`, and never through a symbolic link.
export async function writeEnvFile(filename: string, variables: Variable[], force: boolean) {
  const existing = await lstat(filename).catch((error: unknown) => {
    if (isMissing(error)) return null
    throw error
  })
  if (existing && (!existing.isFile() || !force))
    throw new CliError(
      `${path.basename(filename)} already exists. Use --force to replace it.`,
      "PATH_CONFLICT",
    )
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}`)
  try {
    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await handle.writeFile(serializeDotenv(variables), "utf8")
    } finally {
      await handle.close()
    }
    await chmod(temporary, 0o600)
    await rename(temporary, filename)
  } finally {
    await rm(temporary, { force: true })
  }
}

// Runs `command` with the group's variables on top of the current environment, passing stdio
// through, and resolves with its exit status. Ctrl-C and termination reach the child, which
// decides when to stop.
export function runWith(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  variables: Variable[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...env, ...Object.fromEntries(variables.map(({ name, value }) => [name, value])) },
      stdio: "inherit",
    })
    const forward = (signal: NodeJS.Signals) => () => child.kill(signal)
    const handlers = (["SIGINT", "SIGTERM", "SIGHUP"] as const).map(
      (signal) => [signal, forward(signal)] as const,
    )
    for (const [signal, handler] of handlers) process.on(signal, handler)
    const cleanup = () => {
      for (const [signal, handler] of handlers) process.off(signal, handler)
    }
    child.on("error", (error) => {
      cleanup()
      reject(
        isMissing(error)
          ? new CliError(`Command not found: ${command}.`, "COMMAND_NOT_FOUND", 127)
          : error,
      )
    })
    child.on("exit", (code, signal) => {
      cleanup()
      resolve(code ?? (signal ? 128 + (os.signals[signal] ?? 0) : 1))
    })
  })
}
