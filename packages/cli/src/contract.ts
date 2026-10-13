import { CliError } from "./errors"

// The versioned CLI wire contract, served by apps/web/app/api/v1; see API.md.
export interface CodeFile {
  name: string
  language: string
  content: string
  lines?: { start: number; end: number }
}
export interface Capture {
  title: string
  description: string
  visibility: "private" | "unlisted" | "public"
  tags: string[]
  collection: string | null
  files: CodeFile[]
  source: { repository: string | null; commit: string | null; dirty: boolean } | null
}
export interface Paste extends Capture {
  id: string
  slug: string
}
export interface Bundle {
  version: 1
  pastes: Capture[]
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("Expected a JSON object.", "INVALID_RESPONSE", 1)
  }
  return value as Record<string, unknown>
}

export function string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CliError(`Expected a nonempty ${name} string.`, "INVALID_RESPONSE", 1)
  }
  return value
}

export function codeFile(value: unknown): CodeFile {
  const file = record(value)
  if (typeof file.content !== "string") {
    throw new CliError("Expected file content to be a string.", "INVALID_RESPONSE", 1)
  }
  const result: CodeFile = {
    name: string(file.name, "file name"),
    language: string(file.language, "language"),
    content: file.content,
  }
  if (file.lines !== undefined) {
    const lines = record(file.lines)
    if (
      !Number.isSafeInteger(lines.start) ||
      !Number.isSafeInteger(lines.end) ||
      (lines.start as number) < 1 ||
      (lines.end as number) < (lines.start as number)
    ) {
      throw new CliError("Invalid source line range.", "INVALID_RESPONSE", 1)
    }
    result.lines = { start: lines.start as number, end: lines.end as number }
  }
  return result
}

export function capture(value: unknown): Capture {
  const data = record(value)
  if (!Array.isArray(data.files) || !data.files.length || data.files.length > 10) {
    throw new CliError("A paste must contain 1–10 files.", "INVALID_RESPONSE", 1)
  }
  const visibility = data.visibility
  if (visibility !== "public" && visibility !== "unlisted" && visibility !== "private") {
    throw new CliError("Invalid paste visibility.", "INVALID_RESPONSE", 1)
  }
  if (!Array.isArray(data.tags) || data.tags.some((tag) => typeof tag !== "string")) {
    throw new CliError("Expected a tags array.", "INVALID_RESPONSE", 1)
  }
  if (typeof data.description !== "string") {
    throw new CliError("Expected a description string.", "INVALID_RESPONSE", 1)
  }
  let source: Capture["source"] = null
  if (data.source != null) {
    const raw = record(data.source)
    if (
      (raw.repository !== null && typeof raw.repository !== "string") ||
      (raw.commit !== null && typeof raw.commit !== "string") ||
      typeof raw.dirty !== "boolean"
    ) {
      throw new CliError("Invalid source metadata.", "INVALID_RESPONSE", 1)
    }
    source = raw as NonNullable<Capture["source"]>
  }
  return {
    title: string(data.title, "title"),
    description: data.description,
    visibility,
    tags: data.tags as string[],
    collection: data.collection === null ? null : string(data.collection, "collection"),
    files: data.files.map(codeFile),
    source,
  }
}

export function paste(value: unknown): Paste {
  const data = record(value)
  return { ...capture(data), id: string(data.id, "id"), slug: string(data.slug, "slug") }
}

export function bundle(value: unknown): Bundle {
  const data = record(value)
  if (data.version !== 1 || !Array.isArray(data.pastes) || !data.pastes.length) {
    throw new CliError("Expected a version 1 Sniptide bundle with pastes.")
  }
  return { version: 1, pastes: data.pastes.map(capture) }
}
