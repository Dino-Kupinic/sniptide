"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import { toast } from "@sniptide/ui/components/toast"
import { CopyIcon, EyeOffIcon, LockIcon } from "lucide-react"
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
    <main className="ph-no-capture flex flex-1 flex-col items-center px-4 py-10 lg:py-16">
      <div className="flex w-full max-w-xl flex-col gap-5 rounded-lg border border-border bg-background p-6 shadow-(--dialog-shadow)">
        <LockIcon className="size-5" />
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em]">
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
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the Input inside is the control */}
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t("password")}
            <Input
              className="text-base lg:text-sm"
              name="password"
              type="password"
              autoComplete="off"
              minLength={12}
              maxLength={128}
              required
              aria-invalid={Boolean(error)}
            />
          </label>
          <Button type="submit" size="xl" loading={busy}>
            {busy ? t("checking") : t("reveal_secrets")}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {entries.length > 0 && (
          <section className="flex flex-col gap-3">
            <Button
              variant="ghost"
              size="lg"
              className="-ml-3 self-start max-lg:h-10"
              onClick={clear}
            >
              <EyeOffIcon />
              {t("hide_all")}
            </Button>
            <ul className="overflow-hidden rounded-lg divide-y divide-border border border-border">
              {entries.map(([name, value]) => (
                <li key={name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-mono text-sm font-medium break-all">{name}</h2>
                    <p className="mt-1 max-h-48 overflow-auto font-mono text-sm break-all whitespace-pre-wrap text-muted-foreground">
                      {value || t("empty_value")}
                    </p>
                  </div>
                  <Button
                    size="lg"
                    variant="outline"
                    className="shrink-0 max-lg:h-[38px]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(value)
                        toast.success(t("value_copied", { name }))
                      } catch {
                        setError(t("copy_error"))
                      }
                    }}
                  >
                    <CopyIcon />
                    {t("copy")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
