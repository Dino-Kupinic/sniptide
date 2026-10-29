"use client"

import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "cn"
import { AlertCircleIcon, XIcon } from "lucide-react"
import * as React from "react"

type ToastKind = "success" | "error"
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

const DURATION: Record<ToastKind, number> = { success: 3000, error: 6000 }
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
// `success` confirms something that happened with a pink check, and `error` says what failed.
// Pass `action` for something the reader can take back, like Undo; it renders as a blue chip.
// Mount <Toaster /> once near the root.
const toast = {
  success: (message: string, options?: ToastOptions) => show("success", message, options),
  error: (message: string, options?: ToastOptions) => show("error", message, options),
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

  // Phones stack toasts centered under the top bar; from 1024px they sit in the bottom-right
  // corner at one width, so a stack lines up on its right edge. On touch screens the 24px buttons
  // reach 40px through an invisible hit area.
  return (
    <div
      data-slot="toaster"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.75rem)] z-100 flex flex-col items-center gap-2 px-4 lg:top-auto lg:right-[calc(env(safe-area-inset-right)+1.5rem)] lg:bottom-6 lg:left-auto lg:w-80 lg:px-0",
        className,
      )}
    >
      {current.map((item) => (
        <div
          key={item.id}
          data-slot="toast"
          data-kind={item.kind}
          role={item.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm min-h-12 items-center gap-3 rounded-lg border bg-popover py-2.5 pr-2.5 pl-4 text-[13px] leading-[18px] text-popover-foreground shadow-(--float-shadow) animate-in fade-in slide-in-from-top-2 duration-200 lg:slide-in-from-bottom-2 motion-reduce:animate-none",
            item.kind === "error" ? "border-destructive/40" : "border-border",
          )}
        >
          {item.kind === "error" ? (
            <AlertCircleIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <SuccessCheck className="text-highlight" />
          )}
          <span className="min-w-0 flex-1">{item.message}</span>
          {item.action ? (
            <button
              type="button"
              onClick={() => {
                dismiss(item.id)
                void item.action?.run()
              }}
              className="relative h-6 shrink-0 rounded-md bg-primary px-2 text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring/40 active:translate-y-px pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
            >
              {item.action.label}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={dismissLabel}
            onClick={() => dismiss(item.id)}
            className="relative flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export { Toaster, toast }
