import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { glob, lstat, mkdir, open, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import type { Capture, CodeFile } from "./contract"
import { CliError, isMissing } from "./errors"

const exec = promisify(execFile)
const maxBytes = 1024 * 1024
const forbiddenDirectories = new Set([".git", "node_modules", ".next", ".turbo"])

export function safeName(name: string): string {
  const parts = name.split("/")
  if (
    !name ||
    name.length > 120 ||
    /[\\:]/.test(name) ||
    [...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        forbiddenDirectories.has(part.toLowerCase()) ||
        /^\.env(?:\.|$)/i.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  ) {
    throw new CliError(`Unsafe or unsupported file path: ${JSON.stringify(name)}.`, "UNSAFE_PATH")
  }
  return name
}

async function inspect(
  root: string,
  name: string,
): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  let current = root
  const parts = name.split("/")
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part)
    let info: Awaited<ReturnType<typeof lstat>>
    try {
      info = await lstat(current)
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
    if (info.isSymbolicLink()) throw new CliError(`Refusing symbolic link: ${name}.`, "UNSAFE_PATH")
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw new CliError(`A parent path is not a directory: ${name}.`, "PATH_CONFLICT")
    }
    if (index === parts.length - 1) return info
  }
  return null
}

export function detectLanguage(name: string): string {
  const base = path.posix.basename(name)
  const exact: Record<string, string> = {
    Dockerfile: "docker",
    "docker-compose.yml": "docker",
    "compose.yaml": "docker",
    "compose.yml": "docker",
    "nginx.conf": "nginx",
    ".zshrc": "shell",
    ".bashrc": "shell",
    ".profile": "shell",
    crontab: "shell",
  }
  const extensions: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    py: "python",
    nginx: "nginx",
    dockerfile: "docker",
    yaml: "yaml",
    yml: "yaml",
    go: "go",
    tf: "hcl",
    hcl: "hcl",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    txt: "text",
    log: "text",
  }
  return exact[base] ?? extensions[base.split(".").pop()?.toLowerCase() ?? ""] ?? "text"
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await exec("git", args, { cwd, timeout: 5000, maxBuffer: 1024 * 1024 })).stdout.trim()
  } catch {
    return null
  }
}

function repository(remote: string | null): string | null {
  if (!remote) return null
  try {
    const url = new URL(remote)
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol)) return null
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return url.href
  } catch {
    const scp = remote.match(/^(?:[^@/:]+@)?([^/:]+):(.+)$/)
    return scp ? `ssh://${scp[1]}/${scp[2]}` : null
  }
}

export async function collectFiles(
  cwd: string,
  patterns: string[],
  lines?: string,
): Promise<{ files: CodeFile[]; source: Capture["source"] }> {
  if (!patterns.length) throw new CliError("Provide files, directories, or quoted globs to push.")
  const root = await realpath(cwd)
  const names = new Set<string>()
  const exclusions = [
    "**/.git/**",
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/.env",
    "**/.env.*",
  ]
  for (const pattern of patterns) {
    // Check the non-glob prefix before traversing, including absolute paths and ../ escapes.
    if (
      path.isAbsolute(pattern) ||
      pattern.split(/[\\/]/).includes("..") ||
      pattern.includes("\\")
    ) {
      throw new CliError(
        "Capture paths must stay relative to the current directory.",
        "UNSAFE_PATH",
      )
    }
    let matched = 0
    const literal = pattern.replace(/^\.\//, "").replace(/\/$/, "")
    let directory = false
    if (!/[*?[\]{}]/.test(literal)) {
      if (literal === ".") directory = true
      else {
        safeName(literal)
        directory = (await inspect(root, literal))?.isDirectory() ?? false
      }
    }
    for await (const entry of glob(directory ? `${literal}/**/*` : pattern, {
      cwd: root,
      exclude: exclusions,
    })) {
      const name = entry.split(path.sep).join("/")
      // Globs skip sensitive/ignored material; literal sensitive names fail above.
      try {
        safeName(name)
      } catch {
        continue
      }
      const info = await inspect(root, name)
      if (!info?.isFile()) continue
      if ((await git(root, ["check-ignore", "--", name])) !== null) continue
      matched++
      names.add(name)
      if (names.size > 10)
        throw new CliError("A paste supports up to 10 files. Narrow the selection.")
    }
    if (!matched) throw new CliError(`No eligible files matched ${JSON.stringify(pattern)}.`)
  }
  if (lines && names.size !== 1) throw new CliError("--lines requires exactly one file.")
  const files: CodeFile[] = []
  let bytes = 0
  for (const name of [...names].sort()) {
    // Recheck just before opening and refuse a leaf symlink even if it changed since the scan.
    const info = await inspect(root, name)
    if (!info?.isFile() || info.size > maxBytes)
      throw new CliError(`File is unavailable or exceeds 1 MiB: ${name}.`)
    const handle = await open(path.join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    let raw: Buffer
    try {
      if (!(await handle.stat()).isFile()) throw new CliError(`Not a regular file: ${name}.`)
      raw = await handle.readFile()
    } finally {
      await handle.close()
    }
    let content: string
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(raw)
    } catch {
      throw new CliError(`Only UTF-8 text files can be captured: ${name}.`)
    }
    if (raw.includes(0)) throw new CliError(`Binary file cannot be captured: ${name}.`)
    const file: CodeFile = { name, language: detectLanguage(name), content }
    if (lines) {
      const match = lines.match(/^(\d+):(\d+)$/)
      const start = Number(match?.[1])
      const end = Number(match?.[2])
      const split = content.match(/[^\n]*\n|[^\n]+$/g) ?? []
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end < start ||
        end > split.length
      ) {
        throw new CliError("--lines must be START:END within the file (1-based, inclusive).")
      }
      file.content = split.slice(start - 1, end).join("")
      file.lines = { start, end }
    }
    bytes += Buffer.byteLength(file.content)
    if (bytes > maxBytes) throw new CliError("A capture is limited to 1 MiB of UTF-8 text.")
    files.push(file)
  }
  if (!files.some((file) => file.content.trim()))
    throw new CliError("Capture some nonempty code first.")
  const commit = await git(root, ["rev-parse", "HEAD"])
  const source = commit
    ? {
        repository: repository(await git(root, ["remote", "get-url", "origin"])),
        commit,
        dirty: (await git(root, ["status", "--porcelain", "--", ...names])) !== "",
      }
    : null
  return { files, source }
}

export async function restoreFiles(
  directory: string,
  pastes: Capture[],
  force: boolean,
  dryRun: boolean,
): Promise<string[]> {
  const files = pastes.flatMap((paste) => paste.files)
  if (!files.length) throw new CliError("There are no files to pull.")
  return writeFiles(directory, files, force, dryRun)
}

// Writes every file under one root, or none of them when a path is unsafe or already taken.
export async function writeFiles(
  directory: string,
  files: { name: string; content: string }[],
  force: boolean,
  dryRun: boolean,
): Promise<string[]> {
  const names = new Set<string>()
  let bytes = 0
  for (const file of files) {
    safeName(file.name)
    const key = file.name.toLowerCase()
    if (names.has(key)) throw new CliError(`Duplicate output path: ${file.name}.`, "PATH_CONFLICT")
    names.add(key)
    bytes += Buffer.byteLength(file.content)
  }
  if (bytes > 20 * maxBytes) throw new CliError("Pulls are limited to 20 MiB. Pull fewer pastes.")
  for (const name of names) {
    const parts = name.split("/")
    for (let i = 1; i < parts.length; i++) {
      if (names.has(parts.slice(0, i).join("/")))
        throw new CliError("Output files conflict with a folder path.", "PATH_CONFLICT")
    }
  }
  // Preflight the complete collection before writing the first file.
  for (const file of files) {
    const existing = await inspect(directory, file.name)
    if (existing && (!existing.isFile() || !force)) {
      throw new CliError(
        `Output already exists: ${file.name}. Use --force to replace regular files.`,
        "PATH_CONFLICT",
      )
    }
  }
  const rootInfo = await lstat(directory).catch((error: unknown) => {
    if (isMissing(error)) return null
    throw error
  })
  if (rootInfo && !rootInfo.isDirectory())
    throw new CliError("The output root must be a directory, not a symbolic link.", "UNSAFE_PATH")
  if (dryRun) return files.map((file) => file.name)
  await mkdir(directory, { recursive: true })
  const root = await realpath(directory)
  for (const file of files) {
    await inspect(root, file.name)
    const filename = path.join(root, file.name)
    await mkdir(path.dirname(filename), { recursive: true })
    const flags =
      constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      (force ? constants.O_TRUNC : constants.O_EXCL)
    const handle = await open(filename, flags, 0o644)
    try {
      await handle.writeFile(file.content, "utf8")
    } finally {
      await handle.close()
    }
  }
  return files.map((file) => file.name)
}

export async function readBundle(filename: string): Promise<unknown> {
  const info = await lstat(filename)
  if (!info.isFile() || info.size > 25 * maxBytes)
    throw new CliError("Bundle must be a regular JSON file smaller than 25 MiB.")
  try {
    return JSON.parse(await readFile(filename, "utf8"))
  } catch {
    throw new CliError("Bundle is not valid JSON.")
  }
}
