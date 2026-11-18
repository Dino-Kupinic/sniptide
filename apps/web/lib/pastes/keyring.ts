import {
  KEY_ID_PATTERN,
  KEY_PATTERN,
  keyIdOf,
  withKeyFragment,
} from "@sniptide/contracts/encryption"
import * as React from "react"

// Keys of end-to-end encrypted pastes this browser created or was given, by their public key id.
// The server never has them, so this is what lets an owner reopen an encrypted paste from their
// lists and copy its full link again. They live in localStorage: readable by this origin's
// scripts, like the plaintext on screen, and gone when site data is cleared.

const STORAGE_KEY = "sniptide.e2e.keys"
const CHANGED = "sniptide:e2e-keys"

function readAll(): Record<string, string> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")
    if (typeof stored !== "object" || stored === null) return {}
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, string] =>
          KEY_ID_PATTERN.test(entry[0]) &&
          typeof entry[1] === "string" &&
          KEY_PATTERN.test(entry[1]),
      ),
    )
  } catch {
    // Blocked storage or a damaged entry: no remembered keys.
    return {}
  }
}

export function findKey(keyId: string): string | null {
  if (typeof window === "undefined") return null
  return readAll()[keyId] ?? null
}

// Returns false when the browser refuses storage, so the caller can say the link must be kept.
export async function rememberKey(key: string) {
  try {
    const keys = { ...readAll(), [await keyIdOf(key)]: key }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
    window.dispatchEvent(new Event(CHANGED))
    return true
  } catch {
    return false
  }
}

export function subscribeKeys(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener("storage", onChange)
  }
}

// The share link with its key, when this browser holds it; the bare link otherwise.
export function keyedUrl(url: string, keyId: string | null | undefined) {
  const key = keyId ? findKey(keyId) : null
  return key ? withKeyFragment(url, key) : url
}

// `keyedUrl` for render time. The server and the first client render give the bare link.
export function useKeyedUrl(url: string, keyId: string | null | undefined) {
  return React.useSyncExternalStore(
    subscribeKeys,
    () => keyedUrl(url, keyId),
    () => url,
  )
}
