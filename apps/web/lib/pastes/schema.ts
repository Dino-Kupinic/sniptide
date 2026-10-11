import "server-only"

import { z } from "zod"
import { getConfig } from "@/lib/config"
import { formatLimit } from "@/lib/format"
import { detectLanguage } from "./languages"
import type { PasteInput } from "./types"
import { EXPIRIES, VISIBILITIES } from "./types"

// The most a paste can hold, summed across its files. Set with MAX_PASTE_SIZE (1 MB by default).
export const maxPasteBytes = () => getConfig().maxPasteBytes

export const pasteSchema = z.object({
  title: z.string().trim().min(1, "Give the paste a title.").max(120),
  description: z.string().trim().max(280),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Every file needs a name.").max(120),
        content: z.string(),
      }),
    )
    .min(1)
    .max(10, "A paste can hold up to 10 files.")
    .refine((files) => files.some((file) => file.content.trim()), "Paste some code first.")
    .refine(
      (files) => new Set(files.map((file) => file.name)).size === files.length,
      "File names must be unique.",
    )
    .refine(
      (files) =>
        files.reduce((size, file) => size + new TextEncoder().encode(file.content).byteLength, 0) <=
        maxPasteBytes(),
      { error: () => `Pastes are limited to ${formatLimit(maxPasteBytes())}.` },
    ),
  visibility: z.enum(VISIBILITIES),
  expiry: z.enum([...EXPIRIES, "keep"]),
  slug: z.string().trim(),
  collection: z.string().nullable(),
  password: z.string().max(200).nullable(),
  burnAfterRead: z.boolean(),
})

// Every persistence entry point uses this contract, including imports and future callers.
export function parsePasteInput(input: PasteInput): PasteInput {
  const data = pasteSchema.parse(input)
  return {
    ...data,
    files: data.files.map((file) => ({ ...file, language: detectLanguage(file.name).id })),
  }
}
