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
import { Sheet, SheetBody, SheetContent, SheetHeader } from "@sniptide/ui/components/sheet"
import { Switch } from "@sniptide/ui/components/switch"
import { cn } from "@sniptide/ui/lib/utils"
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  HistoryIcon,
  LinkIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import {
  GroupedChevron,
  groupedLabelClass,
  groupedPanelClass,
  groupedSettingRowClass,
} from "@/components/lists/grouped-list"
import { LocalDateTime } from "@/components/local-date-time"
import { track } from "@/lib/analytics"
import { runAction } from "@/lib/feedback"
import { updateSharing } from "@/lib/pastes/actions"
import { useKeyedUrl } from "@/lib/pastes/keyring"
import type { Expiry, Visibility } from "@/lib/pastes/types"
import { LinkCopyContent, useCopyLink } from "./copy-button"
import { EncryptionNote } from "./encryption-note"
import { usePasteExpired } from "./expiry-status"
import { type PanelSection, SidePanel } from "./side-panel"

export interface SharingState {
  slug: string
  url: string
  visibility: Visibility
  expiresAt: number | null
  hasPassword: boolean
  burnAfterRead: boolean
  allowRaw: boolean
  // Set on an end-to-end encrypted paste: no Public option and no raw files, and the copied link
  // carries the key.
  encryptionKeyId?: string | null
}

const expiryChoices: { value: Expiry; label: string }[] = [
  { value: "1h", label: "1HourFromNow" },
  { value: "1d", label: "1DayFromNow" },
  { value: "1w", label: "1WeekFromNow" },
  { value: "1m", label: "1MonthFromNow" },
  { value: "1y", label: "1YearFromNow" },
  { value: "never", label: "never" },
]

function ShareLinkField({
  url,
  encryptionKeyId,
  expiresAt,
  className,
}: {
  url: string
  encryptionKeyId?: string | null
  expiresAt: number | null
  className?: string
}) {
  const t = useTranslations("Paste")
  const expired = usePasteExpired(expiresAt)
  const keyed = useKeyedUrl(url, encryptionKeyId)
  const { state, props } = useCopyLink(keyed, () =>
    track("share_link_copied", { from: "sharing_panel" }),
  )

  return (
    <div
      className={cn(
        "rounded-lg flex h-9 items-center border border-border bg-sidebar pl-2.5",
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
      <Button
        type="button"
        variant="inverted"
        size="sm"
        className="mr-1 h-[26px] text-xs"
        {...props}
        disabled={expired}
        title={expired ? t("expiredSharingHelp") : undefined}
      >
        <LinkCopyContent state={state} label={t("copy")} />
      </Button>
    </div>
  )
}

// The sharing controls, shared by the desktop side panel and the mobile settings list. Each
// control saves on change through a server action and the page re-renders with the stored values.
function useSharingControls(state: SharingState, list: boolean) {
  const t = useTranslations("Paste")
  const [visibility, setVisibility] = React.useState(state.visibility)
  const [hasPassword, setHasPassword] = React.useState(state.hasPassword)
  const [settingPassword, setSettingPassword] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [burnAfterRead, setBurnAfterRead] = React.useState(state.burnAfterRead)
  const [allowRaw, setAllowRaw] = React.useState(state.allowRaw)
  const [pending, startTransition] = React.useTransition()
  // The newest save per setting. A failed save only puts its control back while no later change
  // to the same setting is on its way, so a slow failure can't undo a newer choice.
  const latestSave = React.useRef<Record<string, number>>({})
  const saves = React.useRef(0)

  // The page re-renders with the stored values after a save or a change made elsewhere, such as
  // the editor or another tab. Take them over whenever they differ from what was last stored.
  const [stored, setStored] = React.useState(state)
  if (
    stored.visibility !== state.visibility ||
    stored.hasPassword !== state.hasPassword ||
    stored.burnAfterRead !== state.burnAfterRead ||
    stored.allowRaw !== state.allowRaw
  ) {
    setStored(state)
    setVisibility(state.visibility)
    setHasPassword(state.hasPassword)
    setBurnAfterRead(state.burnAfterRead)
    setAllowRaw(state.allowRaw)
  }

  // Reports every change, and puts the control back where it was when the save fails.
  function save(input: Parameters<typeof updateSharing>[1], restore?: () => void) {
    const setting = Object.keys(input).join()
    const id = ++saves.current
    latestSave.current[setting] = id
    startTransition(async () => {
      const result = await runAction(() => updateSharing(state.slug, input), {
        success: t("sharingUpdated"),
        error: t("couldnTUpdateSharingTryAgain"),
      })
      if (!result.ok && latestSave.current[setting] === id) restore?.()
    })
  }

  // The phone's settings list picks the visibility from a menu in its row, like the expiry.
  const visibilityOptions = [
    { value: "private" as const, label: t("private") },
    { value: "unlisted" as const, label: t("unlisted") },
    // A public listing would show an encrypted paste without its key.
    ...(state.encryptionKeyId ? [] : [{ value: "public" as const, label: t("public") }]),
  ]
  const visibilityControl = (
    <SegmentedControl
      aria-label={t("visibility")}
      value={visibility}
      onValueChange={(next) => {
        const previous = visibility
        setVisibility(next)
        save({ visibility: next }, () => setVisibility(previous))
      }}
      options={visibilityOptions}
    />
  )

  const visibilityMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("visibility")}
        className="-mr-2 flex h-10 items-center gap-1 rounded-lg px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="text-muted-foreground">
          {visibilityOptions.find((option) => option.value === visibility)?.label}
        </span>
        <GroupedChevron />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visibilityOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="h-10"
            onClick={() => {
              if (option.value === visibility) return
              const previous = visibility
              setVisibility(option.value)
              save({ visibility: option.value }, () => setVisibility(previous))
            }}
          >
            {option.label}
            {option.value === visibility ? (
              <CheckIcon className="ml-auto text-foreground!" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const expiry = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("expires")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring/40",
          !list && "h-9 w-full justify-between border border-border px-2.5 hover:text-foreground",
          list && "-mr-2 h-10 gap-1 px-2",
        )}
      >
        <span className={cn(list && "text-muted-foreground")}>
          {state.expiresAt === null ? t("never") : <LocalDateTime value={state.expiresAt} />}
        </span>
        {list ? <GroupedChevron /> : <ChevronDownIcon className="size-3.5 text-muted-foreground" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {expiryChoices.map((choice) => (
          <DropdownMenuItem
            key={choice.value}
            className={cn(list && "h-10")}
            onClick={() => save({ expiry: choice.value })}
          >
            {t(choice.label)}
            {choice.value === "never" && state.expiresAt === null ? (
              <CheckIcon className="ml-auto text-foreground!" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const protection = (
    <>
      <SettingRow label={t("password")} list={list}>
        <Switch
          aria-label={t("password")}
          checked={hasPassword || settingPassword}
          onCheckedChange={(checked) => {
            if (checked) return setSettingPassword(true)
            setSettingPassword(false)
            setHasPassword(false)
            save({ password: null }, () => setHasPassword(true))
          }}
        />
      </SettingRow>
      {settingPassword ? (
        <form
          className={cn("flex gap-2", list && "border-b border-border py-3 pr-4")}
          onSubmit={(event) => {
            event.preventDefault()
            if (!password) return
            const had = hasPassword
            setHasPassword(true)
            setSettingPassword(false)
            save({ password }, () => setHasPassword(had))
            setPassword("")
          }}
        >
          <Input
            aria-label={t("newPassword")}
            type="password"
            autoComplete="new-password"
            placeholder={hasPassword ? t("newPassword") : t("password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-8 text-base lg:text-[13px]"
          />
          <Button type="submit" size="sm" className="h-[30px]" disabled={!password}>
            {t("set")}
          </Button>
        </form>
      ) : null}
      {hasPassword && !settingPassword ? (
        <button
          type="button"
          onClick={() => setSettingPassword(true)}
          className={cn(
            "self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground",
            list ? "border-b border-border py-2.5 pr-4 text-left text-[13px]" : "-mt-1",
          )}
        >
          {t("changePassword")}
        </button>
      ) : null}
      <SettingRow label={t("burnAfterReading")} list={list}>
        <Switch
          aria-label={t("burnAfterReading")}
          checked={burnAfterRead}
          onCheckedChange={(checked) => {
            setBurnAfterRead(checked)
            save({ burnAfterRead: checked }, () => setBurnAfterRead(!checked))
          }}
        />
      </SettingRow>
      {state.encryptionKeyId ? null : (
        <SettingRow label={t("allowRawAccess")} list={list}>
          <Switch
            aria-label={t("allowRawAccess")}
            checked={allowRaw}
            onCheckedChange={(checked) => {
              setAllowRaw(checked)
              save({ allowRaw: checked }, () => setAllowRaw(!checked))
            }}
          />
        </SettingRow>
      )}
    </>
  )

  const status = (
    <p aria-live="polite" className="sr-only">
      {pending ? t("savingMessage") : ""}
    </p>
  )

  return {
    visibility,
    visibilityControl,
    visibilityMenu,
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
  const t = useTranslations("Paste")
  const rest: PanelSection[] = [
    { id: "views", label: t("views"), icon: EyeIcon, content: views },
    { id: "revisions", label: t("revisions"), icon: HistoryIcon, content: revisions },
  ]
  if (state) return <OwnerPanel state={state} rest={rest} />

  const shared: PanelSection[] = sharedNote
    ? [{ id: "shared", label: t("sharedWithYou"), icon: UsersIcon, content: sharedNote }]
    : []
  return (
    <SidePanel
      label={t("pasteDetails")}
      sections={[...shared, ...rest]}
      defaultOpen={sharedNote ? ["shared"] : undefined}
    />
  )
}

function OwnerPanel({ state, rest }: { state: SharingState; rest: PanelSection[] }) {
  const t = useTranslations("Paste")
  const controls = useSharingControls(state, false)
  const sections: PanelSection[] = [
    {
      id: "sharing",
      label: t("sharing"),
      icon: LinkIcon,
      content: (
        <>
          <ShareLinkField
            url={state.url}
            encryptionKeyId={state.encryptionKeyId}
            expiresAt={state.expiresAt}
          />
          {state.encryptionKeyId ? <EncryptionNote keyId={state.encryptionKeyId} /> : null}
          {controls.visibilityControl}
          <p className="text-xs text-muted-foreground">
            {t("visibilityHelp", { value: controls.visibility })}
          </p>
          {controls.status}
        </>
      ),
    },
    {
      id: "access",
      label: t("access"),
      icon: ShieldIcon,
      marked: controls.protectedNow,
      content: (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">{t("expires")}</span>
            {controls.expiry}
          </div>
          <div className="flex flex-col gap-2.5">{controls.protection}</div>
        </>
      ),
    },
    ...rest,
  ]

  return <SidePanel label={t("pasteDetails")} sections={sections} />
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
  const t = useTranslations("Paste")
  const controls = useSharingControls(state, true)
  const id = React.useId()

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby={id} className="flex flex-col gap-1.5">
        <h2 id={id} className={groupedLabelClass}>
          {t("sharing")}
        </h2>
        <div className={cn(groupedPanelClass, "pl-4")}>
          <SettingRow label={t("visibility")} list>
            {controls.visibilityMenu}
          </SettingRow>
          <SettingRow label={t("expires")} list>
            {controls.expiry}
          </SettingRow>
          {controls.protection}
        </div>
        <p className="px-4 pt-0.5 text-[13px] leading-[18px] text-muted-foreground">
          {t("visibilityHelp", { value: controls.visibility })}
        </p>
        {controls.status}
      </section>
      {children ? <div className={cn(groupedPanelClass, "pl-4")}>{children}</div> : null}
    </div>
  )
}

function SettingRow({
  label,
  list = false,
  children,
}: {
  label: string
  list?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={list ? groupedSettingRowClass : "flex items-center justify-between gap-3"}>
      <span className={cn(list && "flex-1")}>{label}</span>
      {children}
    </div>
  )
}

// A row in the mobile settings list that opens a bottom sheet, for the side panel sections that
// don't fit in a row (Views, Revisions, Shared with you). The sheet shows the same content the
// desktop panel does, so its actions (Restore revision, Remove from my list) work on phones too.
export function SheetRow({
  label,
  value,
  children,
}: {
  label: string
  value?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useTranslations("Paste")
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          groupedSettingRowClass,
          "w-full gap-2 text-left outline-none focus-visible:text-link active:opacity-60",
        )}
      >
        <span className="flex-1">{label}</span>
        {value ? (
          <span className="truncate text-muted-foreground tabular-nums">{value}</span>
        ) : null}
        <GroupedChevron />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="lg:hidden">
          <SheetHeader title={label} closeLabel={t("close")} />
          <SheetBody className="flex flex-col gap-3 text-sm">{children}</SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}
