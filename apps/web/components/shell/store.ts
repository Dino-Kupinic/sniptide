import * as React from "react"

// A value kept outside React's tree. Changing a context value re-renders everything under its
// provider, and a screen whose HTML is still streaming cannot take that render: React drops the
// streamed HTML and builds the screen again in the browser. A store only re-renders the
// components that read it, so the shell can update while a screen is on its way.
export interface Store<T> {
  get: () => T
  initial: () => T
  set: (value: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    initial: () => initial,
    set(next) {
      if (Object.is(next, value)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// Hydrates with the value the server rendered and follows the store from then on.
export function useStore<T>(store: Store<T>) {
  return React.useSyncExternalStore(store.subscribe, store.get, store.initial)
}
