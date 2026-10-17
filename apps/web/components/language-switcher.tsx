"use client"

import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { localeNames, locales } from "@/lib/i18n/config"

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale()
  const t = useTranslations("Core")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-3 text-sm">
        <span className={compact ? "sr-only" : undefined}>{t("language")}</span>
        <select
          value={locale}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value
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
              }
            })
          }}
          className="min-h-9 min-w-0 rounded-none border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          {locales.map((value) => (
            <option key={value} value={value} lang={value}>
              {localeNames[value]}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t("languageError")}
        </p>
      ) : null}
    </div>
  )
}
