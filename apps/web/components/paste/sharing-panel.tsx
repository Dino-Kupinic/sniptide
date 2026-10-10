"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { Input } from "@sniptide/ui/components/input"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { Switch } from "@sniptide/ui/components/switch"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChevronDownIcon,
  EyeIcon,
  HistoryIcon,
  LinkIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react"
import * as React from "react"
import { updateSharing } from "@/lib/pastes/actions"
import type { Expiry, Visibility } from "@/lib/pastes/types"
import { useCopy } from "./copy-button"
import { type PanelSection, SidePanel } from "./side-panel"

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

const visibilityHelp: Record<Visibility, string> = {
  private: "Only you and people you invite can open it.",
  unlisted: "Anyone with the link can view. Hidden from search.",
  public: "Listed on your profile and open to anyone.",
}

// The sharing controls, shared by the desktop side panel and the mobile settings list. Each
// control saves on change through a server action and the page re-renders with the stored values.
function useSharingControls(state: SharingState, list: boolean) {
  const [visibility, setVisibility] = React.useState(state.visibility)
  const [hasPassword, setHasPassword] = React.useState(state.hasPassword)
  const [settingPassword, setSettingPassword] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [burnAfterRead, setBurnAfterRead] = React.useState(state.burnAfterRead)
  const [allowRaw, setAllowRaw] = React.useState(state.allowRaw)
  const [pending, startTransition] = React.useTransition()

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

  const expiry = (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1.5 outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring/40",
          !list && "h-9 w-full justify-between border border-border px-2.5 hover:text-foreground",
        )}
      >
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
  )

  const protection = (
    <>
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
      <SettingRow label="Burn after reading" list={list}>
        <Switch
          aria-label="Burn after reading"
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

  return {
    visibility,
    visibilityControl,
    expiry,
    protection,
    status,
    protectedNow: hasPassword || burnAfterRead,
  }
}

// The paste detail page's side panel: Sharing and Access for the owner (or a note on who shared
// it), then Views and Revisions, which the server renders and passes in.
export function PasteDetailPanel({
  state,
  sharedNote,
  views,
  revisions,
}: {
  state?: SharingState
  sharedNote?: React.ReactNode
  views: React.ReactNode
  revisions: React.ReactNode
}) {
  const rest: PanelSection[] = [
    { id: "views", label: "Views", icon: EyeIcon, content: views },
    { id: "revisions", label: "Revisions", icon: HistoryIcon, content: revisions },
  ]
  if (state) return <OwnerPanel state={state} rest={rest} />

  const shared: PanelSection[] = sharedNote
    ? [{ id: "shared", label: "Shared with you", icon: UsersIcon, content: sharedNote }]
    : []
  return <SidePanel label="Paste details" sections={[...shared, ...rest]} />
}

function OwnerPanel({ state, rest }: { state: SharingState; rest: PanelSection[] }) {
  const controls = useSharingControls(state, false)
  const sections: PanelSection[] = [
    {
      id: "sharing",
      label: "Sharing",
      icon: LinkIcon,
      content: (
        <>
          <ShareLinkField url={state.url} />
          {controls.visibilityControl}
          <p className="text-xs text-muted-foreground">{visibilityHelp[controls.visibility]}</p>
          {controls.status}
        </>
      ),
    },
    {
      id: "access",
      label: "Access",
      icon: ShieldIcon,
      marked: controls.protectedNow,
      content: (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Expires</span>
            {controls.expiry}
          </div>
          <div className="flex flex-col gap-2.5">{controls.protection}</div>
        </>
      ),
    },
    ...rest,
  ]

  return <SidePanel label="Paste details" sections={sections} />
}

// The mobile settings list on the paste detail page; takes extra read-only rows as children,
// shown under Expires.
export function SharingPanel({
  state,
  children,
}: {
  state: SharingState
  children?: React.ReactNode
}) {
  const controls = useSharingControls(state, true)

  return (
    <section aria-label="Sharing" className="flex flex-col gap-3">
      {controls.visibilityControl}
      <div className="flex flex-col divide-y divide-border border border-border text-[15px]">
        <SettingRow label="Expires" list>
          {controls.expiry}
        </SettingRow>
        {children}
        {controls.protection}
      </div>
      {controls.status}
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
