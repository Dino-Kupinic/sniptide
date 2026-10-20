import { randomUUID } from "node:crypto"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { record, string } from "./contract"
import { CliError, isMissing } from "./errors"

export interface Config {
  baseUrl: string
  token?: string
}
export const defaultBaseUrl = "https://app.sniptide.com"

export function normalizeBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new CliError("The base URL must be an absolute URL.")
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new CliError("Use HTTPS, or HTTP on localhost for development.")
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new CliError("The base URL cannot contain credentials, a query, or a fragment.")
  }
  return url.href.replace(/\/+$/, "")
}

export function configPath(env: NodeJS.ProcessEnv): string {
  return (
    env.SNIPTIDE_CONFIG ??
    path.join(env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "sniptide", "config.json")
  )
}

export async function readConfig(env: NodeJS.ProcessEnv): Promise<Config | null> {
  try {
    const data = record(JSON.parse(await readFile(configPath(env), "utf8")))
    return {
      baseUrl: normalizeBaseUrl(string(data.baseUrl, "base URL")),
      token: data.token === undefined ? undefined : string(data.token, "token"),
    }
  } catch (error) {
    if (isMissing(error)) return null
    throw new CliError(
      "Cannot read Sniptide config. Check the JSON or run logout.",
      "CONFIG_ERROR",
      1,
    )
  }
}

export async function resolveConfig(env: NodeJS.ProcessEnv, baseUrl?: string): Promise<Config> {
  const saved = await readConfig(env)
  const resolvedUrl = normalizeBaseUrl(
    baseUrl ?? env.SNIPTIDE_BASE_URL ?? saved?.baseUrl ?? defaultBaseUrl,
  )
  // Saved credentials belong to exactly one instance, including its path prefix.
  const token =
    env.SNIPTIDE_TOKEN?.trim() || (saved?.baseUrl === resolvedUrl ? saved.token : undefined)
  return { baseUrl: resolvedUrl, token }
}

export async function saveConfig(env: NodeJS.ProcessEnv, config: Config): Promise<void> {
  const filename = configPath(env)
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 })
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: "wx" })
    await chmod(temporary, 0o600)
    await rename(temporary, filename)
  } finally {
    await rm(temporary, { force: true })
  }
}
