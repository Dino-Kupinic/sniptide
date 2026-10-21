"use client"

import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "cn"
import { AlertCircleIcon, XIcon } from "lucide-react"
import * as React from "react"

type ToastKind = "success" | "error" | "info"
type ToastAction = { label: string; run: () => void | Promise<void> }
type ToastItem = {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
  duration: number
}
type ToastOptions = {
  // A button on the toast, e.g. Undo. Clicking it closes the toast and then runs `run`.
  action?: ToastAction
  // How long it stays up, in ms. Toasts with an action default to longer.
  duration?: number
}

const DURATION: Record<ToastKind, number> = { success: 3000, error: 6000, info: 3000 }
const ACTION_DURATION = 8000
const MAX_VISIBLE = 3
const EMPTY: ToastItem[] = []

let items: ToastItem[] = EMPTY
let nextId = 1
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit(next: ToastItem[]) {
  items = next
  for (const listener of listeners) listener()
}

function dismiss(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  emit(items.filter((item) => item.id !== id))
}

function show(kind: ToastKind, message: string, options: ToastOptions = {}) {
  const id = nextId++
  const duration = options.duration ?? (options.action ? ACTION_DURATION : DURATION[kind])
  const dropped = items.slice(0, Math.max(0, items.length - (MAX_VISIBLE - 1)))
  for (const item of dropped) {
    clearTimeout(timers.get(item.id))
    timers.delete(item.id)
  }
  emit([...items.slice(dropped.length), { id, kind, message, action: options.action, duration }])
  timers.set(
    id,
    setTimeout(() => dismiss(id), duration),
  )
  return id
}

// Feedback for actions that have no button or form of their own to report on, like a menu item.
// `info` is neutral; pass `action` for something the reader can take back, like Undo.
// Mount <Toaster /> once near the root.
const toast = {
  success: (message: string, options?: ToastOptions) => show("success", message, options),
  error: (message: string, options?: ToastOptions) => show("error", message, options),
  info: (message: string, options?: ToastOptions) => show("info", message, options),
  dismiss,
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function Toaster({
  className,
  dismissLabel = "Dismiss",
}: {
  className?: string
  dismissLabel?: string
}) {
  const current = React.useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  )

  return (
    <div
      data-slot="toaster"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-100 flex flex-col items-center gap-2 px-4 lg:bottom-6",
        className,
      )}
    >
      {current.map((item) => (
        <div
          key={item.id}
          role={item.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg border bg-popover py-2 pr-1.5 pl-3 text-[13px] text-popover-foreground shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
            item.kind === "error" ? "border-destructive/40" : "border-border",
          )}
        >
          {item.kind === "error" ? (
            <AlertCircleIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          ) : item.kind === "success" ? (
            <SuccessCheck className="text-primary" />
          ) : null}
          <span className="min-w-0 flex-1">{item.message}</span>
          {item.action ? (
            <button
              type="button"
              onClick={() => {
                dismiss(item.id)
                void item.action?.run()
              }}
              className="shrink-0 px-2 py-1 text-[13px] font-semibold text-link outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {item.action.label}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={dismissLabel}
            onClick={() => dismiss(item.id)}
            className="flex size-6 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export { Toaster, toast }
