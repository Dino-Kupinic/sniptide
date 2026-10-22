"use client"

import { Button } from "@sniptide/ui/components/button"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import { entriesSchema, fieldClass, useSecretValues } from "./client"

export function SharedSecret({ token }: { token: string }) {
  const t = useTranslations("Secrets")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const { values, setValues, clear, begin } = useSecretValues()
  return (
    <main className="ph-no-capture mx-auto w-full max-w-xl space-y-6 px-5 py-16">
      <h1 className="text-2xl font-semibold">{t("protected_title")}</h1>
      <p className="text-sm text-muted-foreground">{t("unlock_description")}</p>
      <form
        autoComplete="off"
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError("")
          clear()
          const active = begin()
          const form = event.currentTarget
          const password = new FormData(form).get("password")
          form.reset()
          try {
            const response = await fetch(`/secret-share/${encodeURIComponent(token)}/reveal`, {
              method: "POST",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
            })
            const result: unknown = await response.json()
            if (!response.ok) {
              setError(response.status === 429 ? t("limited_error") : t("locked_error"))
              return
            }
            const data = z.object({ entries: entriesSchema }).parse(result)
            if (active())
              setValues(Object.fromEntries(data.entries.map((entry) => [entry.name, entry.value])))
          } catch {
            setError(t("unlock_error"))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="block space-y-2 text-sm">
          {t("password")}
          <input
            className={fieldClass}
            name="password"
            type="password"
            autoComplete="off"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? t("checking") : t("reveal_secrets")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {Object.keys(values).length > 0 && (
        <section className="space-y-3">
          <Button size="sm" variant="outline" onClick={clear}>
            {t("hide_all")}
          </Button>
          {Object.entries(values).map(([name, value]) => (
            <div key={name} className="space-y-2 border border-border p-4">
              <h2 className="break-all font-mono text-sm font-medium">{name}</h2>
              <p className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-sm">
                {value || t("empty_value")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(value)
                  } catch {
                    setError(t("copy_error"))
                  }
                }}
              >
                {t("copy")}
              </Button>
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
