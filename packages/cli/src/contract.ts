import {
  type Bundle,
  bundleEnvelopeSchema,
  type Capture,
  type CodeFile,
  captureFilesEnvelopeSchema,
  nonemptyStringSchema,
  type Paste,
  responseCaptureSchema,
  responseFileSchema,
  responseSourceSchema,
} from "@sniptide/contracts"

export type { Bundle, Capture, CodeFile, Paste } from "@sniptide/contracts"

import { CliError } from "./errors"

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("Expected a JSON object.", "INVALID_RESPONSE", 1)
  }
  return value as Record<string, unknown>
}

export function string(value: unknown, name: string): string {
  const parsed = nonemptyStringSchema.safeParse(value)
  if (!parsed.success) {
    throw new CliError(`Expected a nonempty ${name} string.`, "INVALID_RESPONSE", 1)
  }
  return parsed.data
}

export function codeFile(value: unknown): CodeFile {
  const file = record(value)
  const content = responseFileSchema.shape.content.safeParse(file.content)
  if (!content.success) {
    throw new CliError("Expected file content to be a string.", "INVALID_RESPONSE", 1)
  }
  const result: CodeFile = {
    name: string(file.name, "file name"),
    language: string(file.language, "language"),
    content: content.data,
  }
  if (file.lines !== undefined) {
    const lines = record(file.lines)
    const parsed = responseFileSchema.shape.lines.safeParse(lines)
    if (!parsed.success || !parsed.data) {
      throw new CliError("Invalid source line range.", "INVALID_RESPONSE", 1)
    }
    result.lines = parsed.data
  }
  return result
}

export function capture(value: unknown): Capture {
  const data = record(value)
  const files = captureFilesEnvelopeSchema.safeParse(data.files)
  if (!files.success) {
    throw new CliError("A paste must contain 1–10 files.", "INVALID_RESPONSE", 1)
  }
  const visibility = responseCaptureSchema.shape.visibility.safeParse(data.visibility)
  if (!visibility.success) {
    throw new CliError("Invalid paste visibility.", "INVALID_RESPONSE", 1)
  }
  const tags = responseCaptureSchema.shape.tags.safeParse(data.tags)
  if (!tags.success) {
    throw new CliError("Expected a tags array.", "INVALID_RESPONSE", 1)
  }
  const description = responseCaptureSchema.shape.description.safeParse(data.description)
  if (!description.success) {
    throw new CliError("Expected a description string.", "INVALID_RESPONSE", 1)
  }
  let source: Capture["source"] = null
  if (data.source != null) {
    const raw = record(data.source)
    const parsed = responseSourceSchema.safeParse(raw)
    if (!parsed.success) {
      throw new CliError("Invalid source metadata.", "INVALID_RESPONSE", 1)
    }
    source = parsed.data
  }
  return {
    title: string(data.title, "title"),
    description: description.data,
    visibility: visibility.data,
    tags: tags.data,
    collection: data.collection === null ? null : string(data.collection, "collection"),
    files: files.data.map(codeFile),
    source,
  }
}

export function paste(value: unknown): Paste {
  const data = record(value)
  return { ...capture(data), id: string(data.id, "id"), slug: string(data.slug, "slug") }
}

export function bundle(value: unknown): Bundle {
  const data = record(value)
  const parsed = bundleEnvelopeSchema.safeParse(data)
  if (!parsed.success) {
    throw new CliError("Expected a version 1 Sniptide bundle with pastes.")
  }
  return { version: 1, pastes: parsed.data.pastes.map(capture) }
}
