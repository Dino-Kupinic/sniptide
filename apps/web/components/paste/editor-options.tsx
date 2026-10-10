"use client"

import { Input } from "@sniptide/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { Switch } from "@sniptide/ui/components/switch"
import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react"
import * as React from "react"
import { useSiteHost } from "@/components/site-host"
import type { Collection } from "@/lib/collections/types"
import { checkSlug } from "@/lib/pastes/actions"
import type { Expiry, Visibility } from "@/lib/pastes/types"

// The paste editor's options (visibility, expiry, custom link, collection, password, burn after
// read). The desktop panel and the mobile sheet lay them out differently from the same pieces.

export const visibilityOptions: { value: Visibility; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
]

export const visibilityHelp: Record<Visibility, string> = {
  private: "Only you and people you invite can open it.",
  unlisted: "Anyone with the link can open it. It isn't listed on your profile.",
  public: "Listed on your profile and open to anyone.",
}

export const expiryOptions: { value: Expiry; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "1d", label: "1d" },
  { value: "1w", label: "1w" },
  { value: "1m", label: "1m" },
  { value: "never", label: "Never" },
]

const NO_COLLECTION = "none"

export type SlugStatus = "idle" | "checking" | "ok" | "taken"

export function useSlugStatus(slug: string, except?: string) {
  const [status, setStatus] = React.useState<SlugStatus>("idle")

  React.useEffect(() => {
    if (!slug || slug === except) return setStatus("idle")

    setStatus("checking")
    let cancelled = false
    const timer = setTimeout(async () => {
      const available = await checkSlug(slug, except)
      if (!cancelled) setStatus(available ? "ok" : "taken")
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug, except])

  return status
}

export function OptionGroup({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-[13px] leading-[18px] font-medium">
        {label}
      </span>
      {children}
    </div>
  )
}

export function ExpiryChips({
  value,
  onChange,
  options,
  currentExpiry,
}: {
  value: Expiry | "keep"
  onChange: (value: Expiry | "keep") => void
  options: { value: Expiry; label: string }[]
  currentExpiry?: string
}) {
  const all: { value: Expiry | "keep"; label: string }[] = currentExpiry
    ? [{ value: "keep", label: "Keep" }, ...options]
    : options

  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Expires after" className="flex flex-wrap gap-1.5">
        {all.map((option) => (
          // biome-ignore lint/a11y/useSemanticElements: styled chips acting as a radio group
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "border border-border px-2.5 py-[5px] text-[13px] leading-[18px] text-foreground/80 outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40",
              value === option.value &&
                "border-foreground bg-foreground font-medium text-background hover:border-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {currentExpiry && value === "keep" ? (
        <p className="text-xs text-muted-foreground">Currently {currentExpiry}.</p>
      ) : null}
    </div>
  )
}

export function SlugInput({
  value,
  onChange,
  status,
}: {
  value: string
  onChange: (value: string) => void
  status: SlugStatus
}) {
  const host = useSiteHost()
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex h-[34px] items-center border border-input focus-within:border-primary",
          status === "taken" && "border-destructive",
        )}
      >
        <span className="flex h-full items-center border-r border-input bg-sidebar pr-2 pl-2.5 font-mono text-xs text-muted-foreground">
          {host}/
        </span>
        <input
          aria-label="Custom link"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^A-Za-z0-9_-]/g, ""))}
          placeholder="random"
          maxLength={40}
          spellCheck={false}
          autoCapitalize="none"
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base outline-none placeholder:text-muted-foreground lg:text-xs"
        />
        {status === "ok" ? (
          <CheckIcon
            aria-label="Available"
            className="mr-2.5 size-[15px] text-link"
            strokeWidth={2.5}
          />
        ) : null}
        {status === "taken" ? (
          <XIcon
            aria-label="Taken"
            className="mr-2.5 size-[15px] text-destructive"
            strokeWidth={2.5}
          />
        ) : null}
      </div>
      {status === "taken" ? (
        <p className="text-xs text-destructive">That link is taken or reserved.</p>
      ) : null}
    </div>
  )
}

export function CollectionSelect({
  value,
  onChange,
  collections,
}: {
  value: string | null
  onChange: (value: string | null) => void
  collections: Collection[]
}) {
  if (collections.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No collections yet.{" "}
        <a
          href="/collections"
          target="_blank"
          rel="noopener"
          className="font-medium text-link hover:underline"
        >
          Create one
        </a>{" "}
        to file pastes under it.
      </p>
    )
  }

  return (
    <Select
      value={value ?? NO_COLLECTION}
      onValueChange={(next) => onChange(next === NO_COLLECTION ? null : (next as string))}
      items={[
        { value: NO_COLLECTION, label: "No collection" },
        ...collections.map((c) => ({ value: c.slug, label: c.name })),
      ]}
    >
      <SelectTrigger
        aria-label="Collection"
        className="h-[34px] w-full px-2.5 font-mono text-[13px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_COLLECTION} className="font-sans text-muted-foreground">
          No collection
        </SelectItem>
        {collections.map((c) => (
          <SelectItem key={c.slug} value={c.slug} className="font-mono text-[13px]">
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  large = false,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  large?: boolean
  disabled?: boolean
}) {
  const id = React.useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span
          id={id}
          className={cn(
            "text-[13px] leading-[18px] font-medium",
            large && "text-[15px] leading-5 font-normal",
          )}
        >
          {label}
        </span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
      <Switch
        aria-labelledby={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input
        aria-label="Paste password"
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[34px] pr-9 text-base lg:text-sm"
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((current) => !current)}
        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {visible ? <EyeOffIcon className="size-[15px]" /> : <EyeIcon className="size-[15px]" />}
      </button>
    </div>
  )
}
