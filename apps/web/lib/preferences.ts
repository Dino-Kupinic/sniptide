// Per-user settings from the Settings page, stored as JSON in user.preferences. This file is
// imported by client components, so it stays free of zod; parsing and validation live in
// ./preferences-schema.ts, which only runs on the server.

import type { Expiry, Visibility } from "@/lib/pastes/types"

export interface Preferences {
  indentation: "2" | "4" | "tab"
  lineNumbers: boolean
  secretDetection: boolean
  defaultVisibility: Visibility
  defaultExpiry: Expiry
  defaultBurnAfterRead: boolean
}

export const defaultPreferences: Preferences = {
  indentation: "2",
  lineNumbers: true,
  secretDetection: true,
  defaultVisibility: "unlisted",
  defaultExpiry: "1w",
  defaultBurnAfterRead: false,
}

export function indentUnit(indentation: Preferences["indentation"]) {
  return indentation === "tab" ? "\t" : " ".repeat(Number(indentation))
}

export function indentLabel(indentation: Preferences["indentation"]) {
  return indentation === "tab" ? "Tabs" : `${indentation} spaces`
}
