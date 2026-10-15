"use client"

import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import type { AutosaveState } from "@/lib/autosave/autosaver"

export function autosaveLabel(state: AutosaveState) {
  switch (state.kind) {
    case "idle":
      return "Changes save automatically"
    case "dirty":
      return "Unsaved changes…"
    case "blocked":
      return `Not saved yet: ${state.reason}`
    case "saving":
      return "Saving…"
    case "saved":
      return "All changes saved"
    case "retrying":
      return state.offline
        ? "Offline. Changes are kept on this device"
        : "Can't reach Sniptide. Changes are kept on this device; retrying"
    case "error":
      return `Not saved: ${state.message}`
    case "conflict":
      return "Changed somewhere else"
  }
}

// One line in the editor's header that says whether the last edit has reached the server.
export function AutosaveStatus({ state, className }: { state: AutosaveState; className?: string }) {
  const problem =
    state.kind === "error" ||
    state.kind === "retrying" ||
    state.kind === "conflict" ||
    state.kind === "blocked"
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "text-xs",
        problem ? "text-destructive" : "text-muted-foreground",
        state.kind === "blocked" && "text-muted-foreground",
        className,
      )}
    >
      {autosaveLabel(state)}
    </span>
  )
}

// Shown when the paste changed in another tab or on another device while this one had edits.
export function ConflictBanner({
  onLoadLatest,
  onKeepMine,
}: {
  onLoadLatest: () => void
  onKeepMine: () => void
}) {
  return (
    <div
      role="alert"
      className="mx-4 flex flex-col gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between lg:mx-0"
    >
      <p>
        This paste was changed in another tab or on another device. Saving stopped so nothing is
        overwritten.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onLoadLatest}>
          Load latest
        </Button>
        <Button type="button" size="sm" onClick={onKeepMine}>
          Keep my version
        </Button>
      </div>
    </div>
  )
}

// Shown after a draft kept on this device was put back, or when it needs a decision.
export function DraftNotice({
  message,
  actions,
}: {
  message: string
  actions: { label: string; onClick: () => void; primary?: boolean }[]
}) {
  return (
    <div
      role="status"
      className="mx-4 flex flex-col gap-3 border border-primary bg-primary/5 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between lg:mx-0"
    >
      <p>{message}</p>
      <div className="flex shrink-0 gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            size="sm"
            variant={action.primary ? "default" : "outline"}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
