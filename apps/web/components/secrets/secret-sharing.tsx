"use client"

import { Button } from "@sniptide/ui/components/button"
import { Input } from "@sniptide/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sniptide/ui/components/select"
import { toast } from "@sniptide/ui/components/toast"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import type { SecretDetail } from "@/lib/env/web-store"
import { SecretRequestError, useSecretRequest } from "./client"

export function SecretSharing({ group }: { group: SecretDetail }) {
  const t = useTranslations("Secrets")
  const format = useFormatter()
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const expiries = [
    { value: "1", label: t("hour") },
    { value: "24", label: t("day") },
    { value: "168", label: t("week") },
  ]
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">{t("sharing")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("sharing_description")}</p>
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
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the Input inside is the control */}
        <label className="flex min-w-48 flex-1 flex-col gap-2 text-sm font-medium">
          {t("password")}
          <Input
            className="text-base lg:text-sm"
            type="password"
            name="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder={t("password_hint")}
          />
        </label>
        <div className="flex flex-col gap-2 text-sm font-medium max-sm:flex-1">
          <span id="secret-share-expiry">{t("expires_in")}</span>
          <Select name="hours" defaultValue="24" items={expiries}>
            <SelectTrigger
              aria-labelledby="secret-share-expiry"
              className="h-10 w-full min-w-32 text-base font-normal lg:text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {expiries.map((expiry) => (
                <SelectItem key={expiry.value} value={expiry.value} className="h-10">
                  {expiry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="xl" className="max-sm:w-full" loading={busy}>
          {busy ? t("creating") : t("create_link")}
        </Button>
      </form>
      {link && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the Input inside is the control */}
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t("protected_link")}
            <Input
              className="font-mono text-base lg:text-sm"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <Button
            variant="outline"
            size="xl"
            className="self-start"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
                toast.success(t("copy_link"))
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
      {group.shares.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("private_notice")}</p>
      ) : (
        <ul className="overflow-hidden rounded-lg divide-y divide-border border border-border">
          {group.shares.map((share) => (
            <li key={share.id} className="flex items-center justify-between gap-3 py-1 pr-1 pl-4">
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
                size="xl"
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
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col items-start gap-3">
        <Button
          variant="ghost"
          size="xl"
          className="-ml-3 text-destructive"
          aria-expanded={confirmDelete}
          onClick={() => setConfirmDelete((open) => !open)}
        >
          {t("delete_group")}
        </Button>
        {confirmDelete ? (
          <>
            <p className="text-sm text-muted-foreground">{t("delete_notice")}</p>
            <Button
              variant="destructive"
              size="xl"
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
          </>
        ) : null}
      </div>
    </section>
  )
}
