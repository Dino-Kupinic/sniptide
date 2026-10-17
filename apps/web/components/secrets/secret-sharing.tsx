"use client"

import { Button } from "@sniptide/ui/components/button"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import type { SecretDetail } from "@/lib/env/web-store"
import { fieldClass, SecretRequestError, useSecretRequest } from "./client"

export function SecretSharing({ group }: { group: SecretDetail }) {
  const t = useTranslations("Secrets")
  const format = useFormatter()
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="font-medium">{t("sharing")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("sharing_description")}</p>
      </div>
      <form
        autoComplete="off"
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError("")
          const form = event.currentTarget
          const data = new FormData(form)
          try {
            const result = z.object({ url: z.string().url() }).parse(
              await secretRequest({
                operation: "share",
                id: group.id,
                input: { password: data.get("password"), hours: Number(data.get("hours")) },
              }),
            )
            setLink(result.url)
            form.reset()
            router.refresh()
          } catch (error) {
            setError(error instanceof SecretRequestError ? error.message : t("create_link_error"))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="min-w-48 flex-1 space-y-2 text-sm">
          {t("password")}
          <input
            className={fieldClass}
            type="password"
            name="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder={t("password_hint")}
          />
        </label>
        <label className="space-y-2 text-sm">
          {t("expires_in")}
          <select className={fieldClass} name="hours" defaultValue="24">
            <option value="1">{t("hour")}</option>
            <option value="24">{t("day")}</option>
            <option value="168">{t("week")}</option>
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? t("creating") : t("create_link")}
        </Button>
      </form>
      {link && (
        <div className="space-y-2 border border-border p-4">
          <label className="block text-sm">
            {t("protected_link")}
            <input
              className={`${fieldClass} mt-2 font-mono`}
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
              } catch {
                setError(t("copy_link_error"))
              }
            }}
          >
            {t("copy_link")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("link_notice")}</p>
        </div>
      )}
      <div className="space-y-2">
        {group.shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("private_notice")}</p>
        ) : (
          group.shares.map((share) => (
            <div
              key={share.id}
              className="flex items-center justify-between gap-3 border border-border px-4 py-2"
            >
              <span className="text-sm">
                {t("expires", {
                  date: format.dateTime(new Date(share.expiresAt), {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                    timeZoneName: "short",
                  }),
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await secretRequest({ operation: "revoke", id: group.id, shareId: share.id })
                    setLink("")
                    router.refresh()
                  } catch {
                    setError(t("revoke_error"))
                  }
                }}
              >
                {t("revoke")}
              </Button>
            </div>
          ))
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-destructive">{t("delete_group")}</summary>
        <p className="my-3 text-sm text-muted-foreground">{t("delete_notice")}</p>
        <Button
          variant="destructive"
          onClick={async () => {
            try {
              await secretRequest({ operation: "delete", id: group.id })
              router.push("/secrets")
              router.refresh()
            } catch {
              setError(t("delete_error"))
            }
          }}
        >
          {t("permanently_delete")}
        </Button>
      </details>
    </section>
  )
}
