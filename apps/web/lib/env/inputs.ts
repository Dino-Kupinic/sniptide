import { z } from "zod"

const byteLength = (value: string) => new TextEncoder().encode(value).length

export const MAX_GROUPS = 100
export const MAX_VARIABLES = 500
export const MAX_VALUE_BYTES = 32 * 1024
export const MAX_GROUP_BYTES = 256 * 1024

export const GROUP_SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,255}$/

export const groupSlugSchema = z
  .string()
  .regex(GROUP_SLUG, "Env group names are 1–64 lowercase letters, digits, dots, - and _.")

export const variablesSchema = z
  .array(
    z.object({
      name: z
        .string()
        .regex(NAME, "Variable names are letters, digits and _, not starting with a digit."),
      value: z
        .string()
        .refine((value) => byteLength(value) <= MAX_VALUE_BYTES, "A value is limited to 32 KB."),
    }),
  )
  .max(MAX_VARIABLES, `An env group holds up to ${MAX_VARIABLES} variables.`)
  .refine(
    (variables) => new Set(variables.map((variable) => variable.name)).size === variables.length,
    "Each variable can only appear once.",
  )
  .refine(
    (variables) =>
      variables.reduce(
        (sum, variable) => sum + byteLength(variable.name) + byteLength(variable.value),
        0,
      ) <= MAX_GROUP_BYTES,
    "An env group is limited to 256 KB.",
  )

export type Variable = z.infer<typeof variablesSchema>[number]

export const secretMetadataSchema = z.object({
  slug: groupSlugSchema,
  project: z.string().trim().min(1).max(100),
  environment: z.enum(["dev", "staging", "prod"]),
})
// Project and environment can be left out when updating a group, which keeps them as they are,
// so groups the CLI made without them can still change their variables.
export const secretSaveSchema = secretMetadataSchema
  .extend({
    project: secretMetadataSchema.shape.project.optional(),
    environment: secretMetadataSchema.shape.environment.optional(),
    revision: z.number().int().min(0).optional(),
    entries: z
      .array(
        z.object({
          name: z.string().regex(NAME),
          value: z.string().max(MAX_VALUE_BYTES),
          replace: z.boolean().default(false),
        }),
      )
      .max(MAX_VARIABLES),
    deleted: z.array(z.string().regex(NAME)).max(MAX_VARIABLES).default([]),
  })
  .refine(
    (input) => new Set(input.entries.map((entry) => entry.name)).size === input.entries.length,
  )
export type SecretSave = z.infer<typeof secretSaveSchema>
export const sharePasswordSchema = z.string().min(12).max(128)
export const secretShareSchema = z.object({
  password: sharePasswordSchema,
  hours: z.union([z.literal(1), z.literal(24), z.literal(168)]),
})
export type SecretShare = z.infer<typeof secretShareSchema>
