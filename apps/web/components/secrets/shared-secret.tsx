"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { toast } from "@sniptide/ui/components/toast"
import { CopyIcon, EyeOffIcon, KeyRoundIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import { entriesSchema, useSecretValues } from "./client"

export function SharedSecret({ token }: { token: string }) {
  const t = useTranslations("Secrets")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const { values, setValues, clear, begin } = useSecretValues()
  const entries = Object.entries(values)
  return (
    <main className="ph-no-capture mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-4 self-center rounded-lg border border-border bg-background p-6 shadow-(--dialog-shadow)">
        <KeyRoundIcon aria-hidden="true" className="size-5" />
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold tracking-[-0.02em]">
            {t("protected_title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("unlock_description")}</p>
        </div>
        <form
          autoComplete="off"
          className="flex flex-col gap-4"
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
                setValues(
                  Object.fromEntries(data.entries.map((entry) => [entry.name, entry.value])),
                )
            } catch {
              setError(t("unlock_error"))
            } finally {
              setBusy(false)
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="shared-secret-password">{t("password")}</Label>
            <Input
              id="shared-secret-password"
              name="password"
              type="password"
              autoComplete="off"
              minLength={12}
              maxLength={128}
              required
            />
          </div>
          <FormError variant="inline" message={error} />
          <Button type="submit" size="lg" loading={busy}>
            {busy ? t("checking") : t("reveal_secrets")}
          </Button>
        </form>
      </div>
      {entries.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button variant="ghost" onClick={clear}>
              <EyeOffIcon />
              {t("hide_all")}
            </Button>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {entries.map(([name, value]) => (
              <li
                key={name}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]"
              >
                <h2 className="truncate py-1 font-mono text-[13px] font-medium" title={name}>
                  {name}
                </h2>
                <p className="col-span-2 row-start-2 max-h-48 overflow-auto py-1 font-mono text-[13px] break-all whitespace-pre-wrap sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  {value || <span className="text-muted-foreground">{t("empty_value")}</span>}
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("copy_name", { name })}
                  className="col-start-2 row-start-1 text-muted-foreground hover:text-foreground sm:col-start-3"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(value)
                      toast.success(t("copied", { name }))
                    } catch {
                      toast.error(t("copy_error"))
                    }
                  }}
                >
                  <CopyIcon />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
