import { z } from "zod"

export const MAX_TAGS = 20
const MAX_FILES = 10
const nonemptyList = <T extends z.ZodType>(element: T) => z.array(element).min(1)
const captureFiles = <T extends z.ZodType>(element: T) => nonemptyList(element).max(MAX_FILES)
export const captureFilesEnvelopeSchema = captureFiles(z.unknown())
export const visibilitySchema = z.enum(["public", "unlisted", "private"])
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i
const TAG_PATTERN = /^[^\s,]+$/
const TAG_LENGTH = 50
export const commitSchema = z.string().regex(COMMIT_PATTERN)
export const sourceSchema = z.object({
  repository: z.string().nullable(),
  commit: z.string().nullable(),
  dirty: z.boolean(),
})
export const nonemptyStringSchema = z.string().refine((value) => Boolean(value.trim()))

export const apiTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Tags can't be empty.")
  .max(TAG_LENGTH, "Tags are limited to 50 characters.")
  .regex(TAG_PATTERN, "Tags can't contain spaces or commas.")

const lineRangeFieldsSchema = z.object({ start: z.int().min(1), end: z.int().min(1) })
export const lineRangeSchema = lineRangeFieldsSchema.refine(
  (lines) => lines.end >= lines.start,
  "A line range must end after it starts.",
)

const repositorySchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value)
      return !url.username && !url.password
    } catch {
      // scp-style remotes like git@github.com:org/repo.git aren't URLs.
      return true
    }
  }, "Leave credentials out of the repository URL.")

const fileSchema = z.object({ name: z.string(), language: z.string(), content: z.string() })

export const apiCaptureSchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  visibility: visibilitySchema.default("private"),
  collection: z.string().trim().min(1).max(40).nullable().default(null),
  tags: z
    .array(apiTagSchema)
    .max(MAX_TAGS, `A paste can have up to ${MAX_TAGS} tags.`)
    .default([])
    .transform((tags) => [...new Set(tags)]),
  source: sourceSchema
    .extend({
      repository: repositorySchema.nullable(),
      commit: z.string().regex(COMMIT_PATTERN, "A commit is a hexadecimal hash.").nullable(),
    })
    .nullable()
    .default(null),
  files: z
    .array(
      fileSchema.extend({
        language: fileSchema.shape.language.optional(),
        lines: lineRangeSchema.optional(),
      }),
    )
    .min(1, "A paste needs at least one file.")
    .max(MAX_FILES, "A paste can hold up to 10 files."),
})
export type CaptureInput = z.input<typeof apiCaptureSchema>

export const mcpTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(TAG_LENGTH)
  .regex(TAG_PATTERN)
const mcpCapture = {
  title: z.string().trim().min(1).max(120),
  files: z
    .array(
      fileSchema.pick({ name: true, content: true }).extend({
        name: z.string().trim().min(1).max(120),
        language: fileSchema.shape.language.optional(),
        lines: lineRangeFieldsSchema.refine(({ start, end }) => end >= start).optional(),
      }),
    )
    .min(1)
    .max(MAX_FILES),
  description: z.string().trim().max(280).optional(),
  visibility: visibilitySchema.extract(["private", "unlisted", "public"]).optional(),
  collection: z.string().min(1).max(40).nullable().optional(),
  tags: z.array(mcpTagSchema).max(MAX_TAGS).optional(),
  source: sourceSchema
    .extend({
      repository: z.string().max(2048).nullable(),
      commit: commitSchema.nullable(),
    })
    .nullable()
    .optional(),
}
export const mcpCaptureSchema = z.object(mcpCapture)

export const apiReplacementSchema = apiCaptureSchema
  .pick({ title: true, files: true })
  .passthrough()

export const responseFileSchema = fileSchema.extend({
  name: nonemptyStringSchema,
  language: nonemptyStringSchema,
  lines: lineRangeSchema.optional(),
})
export const responseSourceSchema = sourceSchema.loose()
export const responseCaptureSchema = z.object({
  title: nonemptyStringSchema,
  description: z.string(),
  visibility: visibilitySchema,
  tags: z.array(z.string()),
  collection: nonemptyStringSchema.nullable(),
  files: captureFiles(responseFileSchema),
  source: responseSourceSchema.nullish().transform((value) => value ?? null),
})
export const responsePasteSchema = responseCaptureSchema.extend({
  id: nonemptyStringSchema,
  slug: nonemptyStringSchema,
})
export const bundleEnvelopeSchema = z.object({
  version: z.literal(1),
  pastes: nonemptyList(z.unknown()),
})
export const bundleSchema = bundleEnvelopeSchema.extend({
  pastes: nonemptyList(responseCaptureSchema),
})
export const apiPasteSchema = responsePasteSchema.extend({
  source: sourceSchema.nullable(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
})
export type CodeFile = z.infer<typeof responseFileSchema>
export type Capture = z.infer<typeof responseCaptureSchema>
export type Paste = z.infer<typeof responsePasteSchema>
export type Bundle = z.infer<typeof bundleSchema>
export type ApiPaste = z.infer<typeof apiPasteSchema>
export type ApiPasteSummary = z.infer<typeof apiPasteSummarySchema>
export type McpCapture = z.infer<typeof mcpCaptureSchema>

export const apiPasteSummarySchema = apiPasteSchema.omit({ files: true }).extend({
  languages: z.array(z.string()),
  bytes: z.int(),
})
