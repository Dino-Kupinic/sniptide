"use client"

import { Input } from "@sniptide/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { StepSlider } from "@sniptide/ui/components/step-slider"
import { Switch } from "@sniptide/ui/components/switch"
import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import { useSiteHost } from "@/components/site-host"
import type { Collection } from "@/lib/collections/types"
import { checkSlug } from "@/lib/pastes/actions"
import { customLink, customLinkName, isReservedLinkName } from "@/lib/pastes/links"
import type { Expiry, Visibility } from "@/lib/pastes/types"

// The paste editor's options (visibility, expiry, custom link, collection, password, burn after
// read). The desktop panel and the mobile settings sheet show the same pieces; `large` gives the
// sheet's controls touch-sized heights.

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
  { value: "1y", label: "1y" },
  { value: "never", label: "Never" },
]

const NO_COLLECTION = "none"

export type SlugStatus = "idle" | "checking" | "ok" | "taken"

// Enter finishes a field without submitting the editor's form.
function commitOnEnter(onCommit?: () => void) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !onCommit) return
    event.preventDefault()
    onCommit()
  }
}

export function useSlugStatus(slug: string, except?: string, enabled = true) {
  const [status, setStatus] = React.useState<SlugStatus>("idle")

  React.useEffect(() => {
    if (!enabled || !slug || slug === except) return setStatus("idle")

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
  }, [slug, except, enabled])

  return status
}

export function ExpiryChips({
  value,
  onChange,
  options,
  currentExpiry,
}: {
  value: Expiry | "keep"
  onChange: (value: Expiry | "keep") => void
  options: { value: Expiry; label: string; valueLabel?: string }[]
  currentExpiry?: string
}) {
  const t = useTranslations("Paste")
  const all: { value: Expiry | "keep"; label: string; valueLabel?: string }[] = currentExpiry
    ? [{ value: "keep", label: t("keep") }, ...options]
    : options

  return (
    <div className="flex flex-col gap-1.5">
      <StepSlider
        aria-label={t("expiresAfter")}
        value={value}
        onValueChange={onChange}
        options={all}
      />
      {currentExpiry && value === "keep" ? (
        <p className="text-xs text-muted-foreground">
          {t("currentExpiry", { expiry: currentExpiry })}
        </p>
      ) : null}
    </div>
  )
}

// The custom link field. Custom links live in the viewer's namespace, so the field edits only the
// name after "<handle>/" and reports the whole link ("<handle>/<name>") through onChange.
// A paste whose link is outside the namespace (generated, or made before namespaces) shows an
// empty field and keeps its link until a name is typed.
export function SlugInput({
  value,
  handle,
  onChange,
  onCommit,
  status,
  large = false,
  disabled = false,
}: {
  value: string
  handle: string | null | undefined
  onChange: (value: string) => void
  // The person finished typing (left the field or pressed Enter).
  onCommit?: () => void
  status: SlugStatus
  // Touch size for the mobile settings sheet.
  large?: boolean
  disabled?: boolean
}) {
  const t = useTranslations("Paste")
  const host = useSiteHost()
  const name = handle ? customLinkName(value, handle) : ""
  // Names like "raw" are paste pages, so say so instead of calling them taken.
  const reserved = isReservedLinkName(name)
  if (!handle) {
    return (
      <p className="text-xs text-muted-foreground">
        {t.rich("customLinkNeedsUsername", {
          link: (chunks) => (
            <a href="/settings" className="text-link underline-offset-2 hover:underline">
              {chunks}
            </a>
          ),
        })}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex h-[34px] items-center overflow-hidden rounded-lg border border-input focus-within:border-primary",
          large && "h-10",
          status === "taken" && "border-destructive",
          disabled && "opacity-50",
        )}
      >
        {/* The side panel is too narrow for the host as well, so the prefix starts at the
            handle and the full address is its tooltip. */}
        <span
          title={`${host}/${handle}/`}
          className="flex h-full min-w-0 max-w-[50%] items-center border-r border-input bg-sidebar pr-2 pl-2.5 font-mono text-xs text-muted-foreground"
        >
          <span className="truncate">{handle}/</span>
        </span>
        <input
          aria-label={t("customLink")}
          disabled={disabled}
          value={name}
          onChange={(event) => {
            const name = event.target.value.replace(/[^A-Za-z0-9_-]/g, "")
            onChange(name ? customLink(handle, name) : "")
          }}
          onBlur={onCommit}
          onKeyDown={commitOnEnter(onCommit)}
          placeholder={t("random")}
          maxLength={40}
          spellCheck={false}
          autoCapitalize="none"
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-base outline-none placeholder:text-muted-foreground lg:text-xs"
        />
        {status === "ok" ? (
          <CheckIcon
            aria-label={t("available")}
            className="mr-2.5 size-[15px] shrink-0 text-link"
            strokeWidth={2.5}
          />
        ) : null}
        {status === "taken" ? (
          <XIcon
            aria-label={t("taken")}
            className="mr-2.5 size-[15px] shrink-0 text-destructive"
            strokeWidth={2.5}
          />
        ) : null}
      </div>
      {status === "taken" ? (
        <p className="text-xs text-destructive">
          {reserved ? t("linkNameReserved") : t("thatLinkIsTaken")}
        </p>
      ) : null}
    </div>
  )
}

export function CollectionSelect({
  value,
  onChange,
  collections,
  large = false,
}: {
  value: string | null
  onChange: (value: string | null) => void
  collections: Collection[]
  large?: boolean
}) {
  const t = useTranslations("Paste")
  if (collections.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t.rich("createCollectionHint", {
          link: (chunks) => (
            <a
              href="/collections"
              target="_blank"
              rel="noopener"
              className="font-medium text-link hover:underline"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    )
  }

  return (
    <Select
      value={value ?? NO_COLLECTION}
      onValueChange={(next) => onChange(next === NO_COLLECTION ? null : (next as string))}
      items={[
        { value: NO_COLLECTION, label: t("noCollection") },
        ...collections.map((c) => ({ value: c.slug, label: c.name })),
      ]}
    >
      <SelectTrigger
        aria-label={t("collection")}
        className={cn("h-[34px] w-full px-2.5 text-[13px]", large && "h-10 px-3 text-base")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_COLLECTION} className={cn("text-muted-foreground", large && "h-10")}>
          {t("noCollection")}
        </SelectItem>
        {collections.map((c) => (
          <SelectItem key={c.slug} value={c.slug} className={large ? "h-10" : "text-[13px]"}>
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
          className={cn("text-[13px] leading-[18px] font-medium", large && "text-sm leading-5")}
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
  onCommit,
  placeholder,
  large = false,
}: {
  value: string
  onChange: (value: string) => void
  // The person finished typing (left the field or pressed Enter).
  onCommit?: () => void
  placeholder: string
  large?: boolean
}) {
  const t = useTranslations("Paste")
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input
        aria-label={t("pastePassword")}
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={commitOnEnter(onCommit)}
        placeholder={placeholder}
        className={cn("h-[34px] pr-9 text-base lg:text-sm", large && "h-10")}
      />
      <button
        type="button"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        onClick={() => setVisible((current) => !current)}
        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {visible ? <EyeOffIcon className="size-[15px]" /> : <EyeIcon className="size-[15px]" />}
      </button>
    </div>
  )
}
