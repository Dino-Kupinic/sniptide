import "server-only"

import { revalidatePath } from "next/cache"
import { getDb } from "@/lib/db"
import { runBestEffortWork } from "@/lib/request-admission"

// Tells open tabs that an account's data changed, wherever the write came from: the app, the
// REST API, the MCP server, the CLI or another tab. Writers NOTIFY a Postgres channel with the
// account id, and every server process LISTENs on it and passes the news to that account's
// /api/live streams. Postgres carries it between instances, so this needs no extra service.
// Only the fact that something changed travels; tabs fetch the data again through the router.

const CHANNEL = "sniptide_changes"

type Listener = () => void

const globalLive = globalThis as typeof globalThis & {
  __sniptideLive?: { listeners: Map<string, Set<Listener>>; listening?: Promise<unknown> }
}

function registry() {
  globalLive.__sniptideLive ??= { listeners: new Map() }
  return globalLive.__sniptideLive
}

// Announces that `userId`'s pastes or collections changed. Best effort: a write never fails
// because the announcement did.
export async function announceChange(userId: string) {
  return runBestEffortWork(async () => {
    try {
      await getDb().$client.notify(CHANNEL, userId)
    } catch (error) {
      console.warn("[live] could not announce a change", error)
    }
  })
}

// What server actions run after a write: re-render this tab and tell the open tabs of every
// account it touched, such as the person a paste was just shared with.
export async function revalidateWorkspace(...userIds: string[]) {
  revalidatePath("/", "layout")
  await Promise.all([...new Set(userIds)].map(announceChange))
}

// Calls `listener` whenever `userId`'s data changes, until the returned function is called.
// The first subscriber in a process opens the one LISTEN connection; postgres.js reconnects it.
export async function subscribeToChanges(userId: string, listener: Listener) {
  const live = registry()
  live.listening ??= getDb()
    .$client.listen(CHANNEL, (payload) => {
      for (const notify of live.listeners.get(payload) ?? []) notify()
    })
    .catch((error) => {
      live.listening = undefined
      throw error
    })
  await live.listening

  const listeners = live.listeners.get(userId) ?? new Set()
  listeners.add(listener)
  live.listeners.set(userId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) live.listeners.delete(userId)
  }
}
