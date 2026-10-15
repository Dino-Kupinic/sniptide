"use client"

import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "cn"
import { AlertCircleIcon, XIcon } from "lucide-react"
import * as React from "react"

type ToastKind = "success" | "error"
type ToastItem = { id: number; kind: ToastKind; message: string }

const DURATION: Record<ToastKind, number> = { success: 3000, error: 6000 }
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

function show(kind: ToastKind, message: string) {
  const id = nextId++
  const dropped = items.slice(0, Math.max(0, items.length - (MAX_VISIBLE - 1)))
  for (const item of dropped) {
    clearTimeout(timers.get(item.id))
    timers.delete(item.id)
  }
  emit([...items.slice(dropped.length), { id, kind, message }])
  timers.set(
    id,
    setTimeout(() => dismiss(id), DURATION[kind]),
  )
  return id
}

// Feedback for actions that have no button or form of their own to report on, like a menu item.
// Mount <Toaster /> once near the root.
const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
  dismiss,
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function Toaster({ className }: { className?: string }) {
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
            "pointer-events-auto flex max-w-sm items-center gap-2 border bg-popover py-2 pr-1.5 pl-3 text-[13px] text-popover-foreground shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
            item.kind === "error" ? "border-destructive/40" : "border-border",
          )}
        >
          {item.kind === "error" ? (
            <AlertCircleIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <SuccessCheck className="text-primary" />
          )}
          <span className="min-w-0 flex-1">{item.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
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
