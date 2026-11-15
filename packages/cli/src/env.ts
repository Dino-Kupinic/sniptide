import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, open, rename, rm } from "node:fs/promises"
import { constants as os } from "node:os"
import path from "node:path"
import { parseDotenv as parse } from "@sniptide/contracts/dotenv"
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
const GROUP = /^[a-z0-9][a-z0-9._-]{0,63}$/
const MAX_FILE_BYTES = 1024 * 1024

export function groupName(value: string | undefined): string {
  if (!value || !GROUP.test(value))
    throw new CliError("Name the env group: 1–64 lowercase letters, digits, dots, - and _.")
  return value
}

export function parseDotenv(text: string): Variable[] {
  return parse(text, CliError)
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

// `env pull` writes this comment as the file's first line, and `env push` sends the revision back
// so the instance refuses the push once the group changed in between (WRK-472). dotenv and
// parseDotenv skip it like any comment.
const HEADER = /^# sniptide env ([a-z0-9][a-z0-9._-]{0,63}) revision (\d{1,15})$/

export function revisionHeader(group: string, revision: number) {
  return `# sniptide env ${group} revision ${revision}\n`
}

// The revision a file was pulled at, when its header names this group.
export function readRevision(text: string, group: string): number | undefined {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? ""
  const match = HEADER.exec(first)
  return match && match[1] === group ? Number(match[2]) : undefined
}

// The file's text with its header set to this group and revision, replacing an existing header.
function withRevision(text: string, group: string, revision: number) {
  const body = text.replace(/^\uFEFF/, "")
  const first = body.split(/\r?\n/, 1)[0] ?? ""
  const rest = HEADER.test(first) ? body.slice(first.length).replace(/^\r?\n/, "") : body
  return revisionHeader(group, revision) + rest
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
  const revision =
    typeof group.revision === "number" &&
    Number.isSafeInteger(group.revision) &&
    group.revision >= 0
      ? group.revision
      : undefined
  return { slug: string(group.slug, "group"), revision, variables }
}

export async function fetchGroup(api: Api, group: string) {
  return parseGroup(await api.request(`env/${encodeURIComponent(group)}`))
}

// Without a revision the push replaces the group whatever happened to it since.
export async function pushGroup(api: Api, group: string, variables: Variable[], revision?: number) {
  const body = revision === undefined ? { variables } : { variables, revision }
  return parseGroup(await api.request(`env/${encodeURIComponent(group)}`, body, "PUT"))
}

export async function readEnvText(filename: string): Promise<string> {
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
    return await handle.readFile("utf8")
  } finally {
    await handle.close()
  }
}

// Writes the .env file owner-only (0600), through a temporary file so a reader never sees half of
// it. An existing file is only replaced with `force`, and never through a symbolic link.
export async function writeEnvFile(
  filename: string,
  variables: Variable[],
  force: boolean,
  header = "",
) {
  const existing = await lstat(filename).catch((error: unknown) => {
    if (isMissing(error)) return null
    throw error
  })
  if (existing && (!existing.isFile() || !force))
    throw new CliError(
      `${path.basename(filename)} already exists. Use --force to replace it.`,
      "PATH_CONFLICT",
    )
  await replaceFile(filename, header + serializeDotenv(variables))
}

// After a push, records the group's new revision in the file it came from, so the next push from
// it isn't refused as stale. Only the header line changes.
export async function stampRevision(filename: string, group: string, revision: number) {
  const existing = await lstat(filename)
  if (!existing.isFile()) return
  await replaceFile(filename, withRevision(await readEnvText(filename), group, revision))
}

async function replaceFile(filename: string, text: string) {
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}`)
  try {
    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await handle.writeFile(text, "utf8")
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
