// Per-user settings from the Settings page, stored as JSON in user.preferences. This file is
// imported by client components, so it stays free of zod; parsing and validation live in
// ./preferences-schema.ts, which only runs on the server.

import type { NotificationKind } from "@/lib/notifications/types"
import type { Expiry, Visibility } from "@/lib/pastes/types"

export type NotificationChannel = "inApp" | "email"
export type NotificationPreferences = Record<NotificationKind, Record<NotificationChannel, boolean>>

export const defaultNotificationPreferences: NotificationPreferences = {
  shared: { inApp: true, email: false },
  burned: { inApp: true, email: false },
  expiring: { inApp: true, email: false },
  views: { inApp: true, email: false },
}

export interface Preferences {
  notifications: NotificationPreferences
  indentation: "2" | "4" | "tab"
  lineNumbers: boolean
  secretDetection: boolean
  defaultVisibility: Visibility
  defaultExpiry: Expiry
  defaultBurnAfterRead: boolean
}

export const defaultPreferences: Preferences = {
  notifications: defaultNotificationPreferences,
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
