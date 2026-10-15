"use server"

import { markAllNotificationsRead, markNotificationRead } from "./store"

// The bell marks notifications read through these, then asks /api/notifications for the new state.
export async function markRead(id: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false }
  return { ok: await markNotificationRead(id) }
}

export async function markAllRead(): Promise<{ ok: boolean }> {
  return { ok: await markAllNotificationsRead() }
}
