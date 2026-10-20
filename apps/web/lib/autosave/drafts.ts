// Local backup of what someone is typing, so closing the tab or losing the network doesn't lose
// it. A draft is removed as soon as the server has the same content. Drafts live in IndexedDB on
// this device only; secrets such as paste passwords never go into one.

export interface Draft<T> {
  // What the draft was based on: the server version it started from, or null for a new paste.
  baseVersion: number | null
  // When it was last written (epoch ms).
  savedAt: number
  value: T
}

export type DraftWriteResult = { kind: "saved" } | { kind: "unavailable" }

export interface DraftStore {
  get<T>(key: string): Promise<Draft<T> | null>
  put<T>(key: string, draft: Draft<T>): Promise<DraftWriteResult>
  delete(key: string): Promise<void>
}

const DATABASE = "sniptide"
const STORE = "drafts"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      request.onsuccess = () => request.result.close()
      reject(new Error("IndexedDB is blocked"))
    }
  })
}

function run<R>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<R>,
): Promise<R> {
  return open().then(
    (db) =>
      new Promise<R>((resolve, reject) => {
        try {
          const transaction = db.transaction(STORE, mode)
          transaction.onerror = transaction.onabort = () => {
            db.close()
            reject(transaction.error)
          }
          const request = action(transaction.objectStore(STORE))
          transaction.oncomplete = () => {
            db.close()
            resolve(request.result)
          }
        } catch (error) {
          db.close()
          reject(error)
        }
      }),
  )
}

// Every call fails soft: private windows and blocked storage just mean there is no backup.
export const indexedDbDrafts: DraftStore = {
  async get<T>(key: string) {
    if (typeof indexedDB === "undefined") return null
    try {
      return ((await run("readonly", (store) => store.get(key))) as Draft<T> | undefined) ?? null
    } catch {
      return null
    }
  },
  async put<T>(key: string, draft: Draft<T>) {
    try {
      if (typeof indexedDB === "undefined") return { kind: "unavailable" }
      await run("readwrite", (store) => store.put(draft, key))
      return { kind: "saved" }
    } catch {
      return { kind: "unavailable" }
    }
  },
  async delete(key: string) {
    if (typeof indexedDB === "undefined") return
    try {
      await run("readwrite", (store) => store.delete(key))
    } catch {
      // Same as above: a stale draft is offered again next time, which is harmless.
    }
  },
}

export function memoryDrafts(): DraftStore {
  const drafts = new Map<string, Draft<unknown>>()
  return {
    async get<T>(key: string) {
      return (drafts.get(key) as Draft<T> | undefined) ?? null
    },
    async put<T>(key: string, draft: Draft<T>) {
      drafts.set(key, draft)
      return { kind: "saved" }
    },
    async delete(key: string) {
      drafts.delete(key)
    },
  }
}

// One draft per account and paste, so two accounts on the same browser never see each other's.
export function draftKey(scope: string, editing: string | undefined) {
  return `paste:${scope}:${editing ?? "new"}`
}
