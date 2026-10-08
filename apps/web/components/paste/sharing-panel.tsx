"use client"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDownIcon } from "lucide-react"
import * as React from "react"
import { updateSharing } from "@/lib/pastes/actions"
import type { Expiry, Visibility } from "@/lib/pastes/types"
import { useCopy } from "./copy-button"

export interface SharingState {
  slug: string
  url: string
  visibility: Visibility
  expiresLabel: string
  hasPassword: boolean
  burnAfterRead: boolean
  allowRaw: boolean
}

const expiryChoices: { value: Expiry; label: string }[] = [
  { value: "1h", label: "1 hour from now" },
  { value: "1d", label: "1 day from now" },
  { value: "1w", label: "1 week from now" },
  { value: "1m", label: "1 month from now" },
  { value: "never", label: "Never" },
]

export function ShareLinkField({ url, className }: { url: string; className?: string }) {
  const { copied, copy } = useCopy()

  return (
    <div className={cn("flex h-9 items-center border border-border bg-sidebar pl-2.5", className)}>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
      <Button
        type="button"
        variant="inverted"
        size="sm"
        className="mr-1 h-7 text-xs"
        onClick={() => copy(url)}
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  )
}

// "Sharing" card on the paste detail page. Each control saves on change through a server
// action; the page re-renders with the stored values afterwards.
// Sharing controls for the paste detail page. The "card" variant is the desktop sidebar card;
// "list" is the mobile settings list, which takes extra read-only rows as children. Each control
// saves on change through a server action and the page re-renders with the stored values.
export function SharingPanel({
  state,
  variant = "card",
  children,
}: {
  state: SharingState
  variant?: "card" | "list"
  children?: React.ReactNode
}) {
  const [visibility, setVisibility] = React.useState(state.visibility)
  const [hasPassword, setHasPassword] = React.useState(state.hasPassword)
  const [settingPassword, setSettingPassword] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [burnAfterRead, setBurnAfterRead] = React.useState(state.burnAfterRead)
  const [allowRaw, setAllowRaw] = React.useState(state.allowRaw)
  const [pending, startTransition] = React.useTransition()
  const list = variant === "list"

  function save(input: Parameters<typeof updateSharing>[1]) {
    startTransition(() => updateSharing(state.slug, input))
  }

  const visibilityControl = (
    <SegmentedControl
      aria-label="Visibility"
      value={visibility}
      onValueChange={(next) => {
        setVisibility(next)
        save({ visibility: next })
      }}
      options={[
        { value: "private", label: "Private" },
        { value: "unlisted", label: "Unlisted" },
        { value: "public", label: "Public" },
      ]}
      itemClassName={list ? "py-2 text-sm" : undefined}
    />
  )

  const rows = (
    <>
      <SettingRow label="Expires" list={list}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 lg:font-medium">
            <span className={cn(list && "text-muted-foreground")}>{state.expiresLabel}</span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {expiryChoices.map((choice) => (
              <DropdownMenuItem key={choice.value} onClick={() => save({ expiry: choice.value })}>
                {choice.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SettingRow>
      {list ? children : null}
      <SettingRow label="Password" list={list}>
        <Switch
          aria-label="Password"
          checked={hasPassword || settingPassword}
          onCheckedChange={(checked) => {
            if (checked) return setSettingPassword(true)
            setSettingPassword(false)
            setHasPassword(false)
            save({ password: null })
          }}
        />
      </SettingRow>
      {settingPassword ? (
        <form
          className={cn("flex gap-2", list && "px-4 py-3")}
          onSubmit={(event) => {
            event.preventDefault()
            if (!password) return
            setHasPassword(true)
            setSettingPassword(false)
            save({ password })
            setPassword("")
          }}
        >
          <Input
            aria-label="New password"
            type="password"
            autoComplete="new-password"
            placeholder={hasPassword ? "New password" : "Password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-8 text-base lg:text-[13px]"
          />
          <Button type="submit" size="sm" className="h-8" disabled={!password}>
            Set
          </Button>
        </form>
      ) : null}
      {hasPassword && !settingPassword ? (
        <button
          type="button"
          onClick={() => setSettingPassword(true)}
          className={cn(
            "self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground",
            list ? "px-4 py-2 text-left" : "-mt-1",
          )}
        >
          Change password
        </button>
      ) : null}
      <SettingRow label="Burn after read" list={list}>
        <Switch
          aria-label="Burn after read"
          checked={burnAfterRead}
          onCheckedChange={(checked) => {
            setBurnAfterRead(checked)
            save({ burnAfterRead: checked })
          }}
        />
      </SettingRow>
      <SettingRow label="Allow raw access" list={list}>
        <Switch
          aria-label="Allow raw access"
          checked={allowRaw}
          onCheckedChange={(checked) => {
            setAllowRaw(checked)
            save({ allowRaw: checked })
          }}
        />
      </SettingRow>
    </>
  )

  const status = (
    <p aria-live="polite" className="sr-only">
      {pending ? "Saving" : ""}
    </p>
  )

  if (list) {
    return (
      <section aria-label="Sharing" className="flex flex-col gap-3">
        {visibilityControl}
        <div className="flex flex-col divide-y divide-border border border-border text-[15px]">
          {rows}
        </div>
        {status}
      </section>
    )
  }

  return (
    <section
      aria-labelledby="sharing-heading"
      className="flex flex-col gap-3.5 border border-border p-4"
    >
      <h2 id="sharing-heading" className="text-sm font-semibold">
        Sharing
      </h2>
      <ShareLinkField url={state.url} />
      {visibilityControl}
      <div className="flex flex-col gap-2.5 text-[13px]">{rows}</div>
      {status}
    </section>
  )
}

export function SettingRow({
  label,
  list = false,
  children,
}: {
  label: string
  list?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", list && "h-12 px-4")}>
      <span>{label}</span>
      {children}
    </div>
  )
}
