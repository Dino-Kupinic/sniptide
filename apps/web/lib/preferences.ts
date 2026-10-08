import { z } from "zod"

// Per-user settings from the Settings page, stored as JSON in user.preferences. Parsing is
// forgiving: unknown or missing keys fall back to the defaults below.

export const preferencesSchema = z.object({
  indentation: z.enum(["2", "4", "tab"]).catch("2"),
  lineNumbers: z.boolean().catch(true),
  secretDetection: z.boolean().catch(true),
  defaultVisibility: z.enum(["public", "unlisted", "private"]).catch("unlisted"),
  defaultExpiry: z.enum(["1h", "1d", "1w", "1m", "never"]).catch("1w"),
  defaultBurnAfterRead: z.boolean().catch(false),
})

export type Preferences = z.infer<typeof preferencesSchema>

export const defaultPreferences: Preferences = preferencesSchema.parse({})

export function parsePreferences(json: string | null | undefined): Preferences {
  if (!json) return defaultPreferences
  try {
    return preferencesSchema.parse(JSON.parse(json))
  } catch {
    return defaultPreferences
  }
}

export function indentUnit(indentation: Preferences["indentation"]) {
  return indentation === "tab" ? "\t" : " ".repeat(Number(indentation))
}

export function indentLabel(indentation: Preferences["indentation"]) {
  return indentation === "tab" ? "Tabs" : `${indentation} spaces`
}
