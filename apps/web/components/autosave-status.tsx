"use client"

import { Button } from "@sniptide/ui/components/button"
import { cn } from "@sniptide/ui/lib/utils"
import { createTranslator, useTranslations } from "next-intl"
import type { AutosaveState } from "@/lib/autosave/autosaver"
import en from "@/messages/en/core.json"

const english = createTranslator({ locale: "en", messages: en, namespace: "Core" })
type AutosaveKey =
  | "autosaveIdle"
  | "autosaveDirty"
  | "autosaveBlocked"
  | "autosaveSaving"
  | "autosaveSaved"
  | "autosaveOffline"
  | "autosaveRetry"
  | "autosaveError"
  | "autosaveConflict"
type StatusTranslator = (key: AutosaveKey, values?: Record<string, string>) => string

export function autosaveLabel(state: AutosaveState, t: StatusTranslator = english) {
  switch (state.kind) {
    case "idle":
      return t("autosaveIdle")
    case "dirty":
      return t("autosaveDirty")
    case "blocked":
      return t("autosaveBlocked", { reason: state.reason })
    case "saving":
      return t("autosaveSaving")
    case "saved":
      return t("autosaveSaved")
    case "retrying":
      return state.offline ? t("autosaveOffline") : t("autosaveRetry")
    case "error":
      return t("autosaveError", { message: state.message })
    case "conflict":
      return t("autosaveConflict")
  }
}

// One line in the editor's header that says whether the last edit has reached the server.
export function AutosaveStatus({ state, className }: { state: AutosaveState; className?: string }) {
  const t = useTranslations("Core")
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
      {autosaveLabel(state, t)}
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
  const t = useTranslations("Core")
  return (
    <div
      role="alert"
      className="mx-4 flex flex-col gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between lg:mx-0"
    >
      <p>{t("conflictDescription")}</p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onLoadLatest}>
          {t("loadLatest")}
        </Button>
        <Button type="button" size="sm" onClick={onKeepMine}>
          {t("keepMine")}
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
