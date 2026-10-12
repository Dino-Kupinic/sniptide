"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, ChevronDownIcon, UserIcon, XIcon } from "lucide-react"
import * as React from "react"
import { PersonAvatar } from "@/components/lists/shared-list"
import type { Access, Person, SharePerson } from "@/lib/pastes/types"

// The pieces the share dialog and the New paste invite menu have in common: who someone is, what
// they can do, and the field that looks them up.

export const accessLabel: Record<Access, string> = { view: "Can view", edit: "Can edit" }

const tones: Person["tone"][] = ["primary", "foreground", "muted"]

// A steady avatar fill per person, so they keep their colour between visits.
function toneFor(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return tones[Math.abs(hash) % tones.length] ?? "foreground"
}

export function ShareAvatar({
  person,
  className,
}: {
  person: Pick<SharePerson, "id" | "name" | "handle" | "initials">
  className?: string
}) {
  return (
    <PersonAvatar
      person={{
        name: person.name,
        username: person.handle,
        initials: person.initials,
        tone: toneFor(person.id),
      }}
      className={className}
    />
  )
}

// "Can view ⌄" with view, edit and, when `onRemove` is given, a way to take access away.
export function AccessMenu({
  value,
  onChange,
  onRemove,
  removeLabel = "Remove access",
  disabled,
  className,
  label,
}: {
  value: Access
  onChange: (access: Access) => void
  onRemove?: () => void
  removeLabel?: string
  disabled?: boolean
  className?: string
  label: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        disabled={disabled}
        className={cn(
          "flex shrink-0 items-center gap-1.5 px-2 py-1 text-[13px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 data-popup-open:bg-muted",
          className,
        )}
      >
        {accessLabel[value]}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {(["view", "edit"] as const).map((access) => (
          <DropdownMenuItem key={access} onClick={() => onChange(access)}>
            {accessLabel[access]}
            {access === value ? <CheckIcon className="ml-auto text-link" /> : null}
          </DropdownMenuItem>
        ))}
        {onRemove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              {removeLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The email-or-username field, its access picker and the button that adds the person. The lookup
// is exact on the server, so nothing here suggests names.
export function InviteField({
  onInvite,
  submitLabel,
  error,
  pending,
  compact,
}: {
  onInvite: (identifier: string, access: Access) => Promise<boolean>
  // Shown as a button; the New paste menu adds on Enter instead.
  submitLabel?: string
  error: string | null
  pending: boolean
  compact?: boolean
}) {
  const [identifier, setIdentifier] = React.useState("")
  const [access, setAccess] = React.useState<Access>("view")
  const errorId = React.useId()

  async function submit() {
    if (!identifier.trim() || pending) return
    if (await onInvite(identifier, access)) setIdentifier("")
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex gap-2", submitLabel && "max-lg:flex-wrap")}>
        <label
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 border border-input bg-background px-3 focus-within:border-foreground",
            submitLabel && "max-lg:basis-full",
            compact ? "h-9" : "h-11 lg:h-9",
            error && "border-destructive focus-within:border-destructive",
          )}
        >
          {compact ? null : <UserIcon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="sr-only">Email or username</span>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              // Inside the New paste form, Enter adds the person instead of saving the paste.
              event.preventDefault()
              void submit()
            }}
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Email or username"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground lg:text-sm"
          />
        </label>
        <AccessMenu
          value={access}
          onChange={setAccess}
          label="Access for the person you invite"
          className={cn("border border-input px-3", compact ? "h-9" : "h-11 lg:h-9")}
        />
        {submitLabel ? (
          <Button
            type="button"
            className={cn("shrink-0 max-lg:flex-1", compact ? "h-9" : "h-11 lg:h-9")}
            disabled={!identifier.trim() || pending}
            onClick={() => void submit()}
          >
            {pending ? "Inviting…" : submitLabel}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <XIcon className="size-4" />
    </button>
  )
}
