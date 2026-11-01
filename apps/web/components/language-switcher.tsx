"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { toast } from "@sniptide/ui/components/toast"
import { cn } from "@sniptide/ui/lib/utils"
import { ChevronDownIcon, LanguagesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { type Locale, localeNames, locales } from "@/lib/i18n/config"

// Saves the chosen language in a cookie through /api/locale and re-renders the page in it.
function useLocaleChange() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  function change(next: string, onError?: () => void) {
    setError(false)
    startTransition(async () => {
      try {
        const response = await fetch("/api/locale", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
        })
        if (!response.ok) throw new Error("Language change failed")
        router.refresh()
      } catch {
        setError(true)
        onError?.()
      }
    })
  }

  return { pending, error, change }
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale()
  const t = useTranslations("Core")
  const { pending, error, change } = useLocaleChange()

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-3 text-sm">
        <span className={compact ? "sr-only" : undefined}>{t("language")}</span>
        <span className="relative min-w-0">
          <select
            value={locale}
            disabled={pending}
            onChange={(event) => change(event.target.value)}
            className={cn(
              "h-9 min-w-0 appearance-none rounded-lg border border-input bg-background py-1 pr-9 pl-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
              compact ? "w-26 sm:w-auto" : "min-w-32",
            )}
          >
            {locales.map((value) => (
              <option key={value} value={value} lang={value}>
                {localeNames[value]}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t("languageError")}
        </p>
      ) : null}
    </div>
  )
}

// A ghost button with the globe icon and the current language that opens the list in a menu.
// Compact hides the language name on phones and keeps it in the accessible name.
export function LanguageMenu({
  className,
  side = "top",
  compact = false,
  size = "sm",
}: {
  className?: string
  side?: "top" | "bottom"
  compact?: boolean
  size?: "sm" | "default"
}) {
  const locale = useLocale()
  const t = useTranslations("Core")
  const { pending, change } = useLocaleChange()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={`${t("language")}: ${localeNames[locale as Locale]}`}
        render={
          <Button variant="ghost" size={size} className={cn("text-muted-foreground", className)} />
        }
      >
        <LanguagesIcon />
        <span className={compact ? "max-sm:hidden" : undefined}>
          {localeNames[locale as Locale]}
        </span>
        <ChevronDownIcon className={compact ? "max-sm:hidden" : undefined} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side}>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(next) => change(next as string, () => toast.error(t("languageError")))}
        >
          {locales.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} lang={value} closeOnClick>
              {localeNames[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
