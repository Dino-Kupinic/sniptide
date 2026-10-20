"use client"

import * as React from "react"
import { Autosaver, type AutosaveState, type SaveOutcome } from "./autosaver"
import { DraftBackupWriter, type DraftSnapshot } from "./draft-writer"
import { type Draft, type DraftStore, indexedDbDrafts } from "./drafts"

// React glue for Autosaver: keeps it fed with the latest value and saves when the page is about
// to go away or the network comes back. `save` and `validate` may change on every render.
export function useAutosave<T>({
  value,
  initial,
  save,
  validate,
  manual = false,
}: {
  value: T
  initial: T
  save(value: T): Promise<SaveOutcome<T>>
  validate?(value: T): string | null
  // Track unsaved changes without ever saving them (see AutosaverOptions.manual).
  manual?: boolean
}) {
  const [state, setState] = React.useState<AutosaveState>({ kind: "idle" })
  const saveRef = React.useRef(save)
  const validateRef = React.useRef(validate)
  saveRef.current = save
  validateRef.current = validate

  const [autosaver] = React.useState(
    () =>
      new Autosaver<T>({
        initial,
        save: (next) => saveRef.current(next),
        validate: (next) => validateRef.current?.(next) ?? null,
        onState: setState,
        manual,
        isOffline: () => typeof navigator !== "undefined" && !navigator.onLine,
      }),
  )

  React.useEffect(() => {
    autosaver.update(value)
  }, [autosaver, value])

  React.useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") void autosaver.flush()
    }
    function onPageHide() {
      void autosaver.flush()
    }
    function onOnline() {
      autosaver.retryNow()
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!autosaver.hasUnsavedChanges()) return
      // The local draft still has the edits, but the person should know the server doesn't yet.
      event.preventDefault()
      event.returnValue = ""
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("online", onOnline)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("beforeunload", onBeforeUnload)
      // Leaving the page inside the app: send the last edits. The autosaver is never disposed, so
      // a save that fails here keeps retrying in the background (and Strict Mode's extra cleanup
      // in development doesn't kill it).
      void autosaver.flush()
    }
  }, [autosaver])

  return { autosaver, state }
}

// Reads the draft saved for `key` once, and keeps it up to date while `dirty`: written shortly
// after each change, removed as soon as the value is stored. Nothing is written or removed until
// `enabled`, so the editor can decide what to do with an old draft first.
export function useDraftBackup<T>({
  key,
  value,
  baseVersion,
  dirty,
  enabled,
  store = indexedDbDrafts,
}: {
  key: string
  value: T
  baseVersion: number | null
  dirty: boolean
  enabled: boolean
  store?: DraftStore
}) {
  const writer = React.useMemo(() => new DraftBackupWriter<T>({ key, store }), [key, store])
  const [loaded, setLoaded] = React.useState<{
    writer: DraftBackupWriter<T>
    draft: Draft<T> | null
  } | null>(null)
  const snapshot = React.useMemo<DraftSnapshot<T>>(
    () =>
      !enabled
        ? { kind: "paused" }
        : dirty
          ? { kind: "dirty", value, baseVersion }
          : { kind: "clean" },
    [enabled, dirty, value, baseVersion],
  )

  React.useLayoutEffect(() => writer.update(snapshot), [writer, snapshot])

  React.useEffect(() => {
    let cancelled = false
    writer.read().then((draft) => {
      if (!cancelled) setLoaded({ writer, draft })
    })
    return () => {
      cancelled = true
    }
  }, [writer])

  React.useLayoutEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") void writer.flush()
    }
    function onPageHide() {
      void writer.flush()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
      void writer.flush()
    }
  }, [writer])

  return {
    draft: loaded?.writer === writer ? loaded.draft : undefined,
    discard: () => writer.discard().then(() => setLoaded({ writer, draft: null })),
    saveNow: React.useCallback(() => writer.flush(), [writer]),
  }
}

export interface PasteBroadcast {
  slug: string
  version: number
}

// Tells other tabs with the same paste open that this one saved it, and listens for theirs.
export function useSaveBroadcast(key: string, onSavedElsewhere: (message: PasteBroadcast) => void) {
  const handler = React.useRef(onSavedElsewhere)
  handler.current = onSavedElsewhere
  const channel = React.useRef<BroadcastChannel | null>(null)

  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const next = new BroadcastChannel(`sniptide:${key}`)
    next.onmessage = (event: MessageEvent<PasteBroadcast>) => handler.current(event.data)
    channel.current = next
    return () => {
      next.close()
      channel.current = null
    }
  }, [key])

  return React.useCallback((message: PasteBroadcast) => channel.current?.postMessage(message), [])
}
