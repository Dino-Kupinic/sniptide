import "server-only"

import { z } from "zod"
import { defaultPreferences, type Preferences } from "./preferences"

// Forgiving parse: unknown or missing keys fall back to the defaults.
export const preferencesSchema = z.object({
  indentation: z.enum(["2", "4", "tab"]).catch(defaultPreferences.indentation),
  lineNumbers: z.boolean().catch(defaultPreferences.lineNumbers),
  secretDetection: z.boolean().catch(defaultPreferences.secretDetection),
  defaultVisibility: z
    .enum(["public", "unlisted", "private"])
    .catch(defaultPreferences.defaultVisibility),
  defaultExpiry: z.enum(["1h", "1d", "1w", "1m", "never"]).catch(defaultPreferences.defaultExpiry),
  defaultBurnAfterRead: z.boolean().catch(defaultPreferences.defaultBurnAfterRead),
}) satisfies z.ZodType<Preferences>

export function parsePreferences(json: string | null | undefined): Preferences {
  if (!json) return defaultPreferences
  try {
    return preferencesSchema.parse(JSON.parse(json))
  } catch {
    return defaultPreferences
  }
}
