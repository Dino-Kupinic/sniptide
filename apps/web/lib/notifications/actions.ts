"use server"

import { dismissNotification, markAllNotificationsRead, markNotificationRead } from "./store"

// The bell marks notifications read through these, then asks /api/notifications for the new state.
export async function markRead(id: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false }
  return { ok: await markNotificationRead(id) }
}

// The bell's x: removes one notification from the list.
export async function dismiss(id: string): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false }
  return { ok: await dismissNotification(id) }
}

export async function markAllRead(): Promise<{ ok: boolean }> {
  return { ok: await markAllNotificationsRead() }
}
