"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { Input } from "@sniptide/ui/components/input"
import { Label } from "@sniptide/ui/components/label"
import { SegmentedControl } from "@sniptide/ui/components/segmented-control"
import { toast } from "@sniptide/ui/components/toast"
import { CopyIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { z } from "zod"
import type { SecretDetail } from "@/lib/env/web-store"
import { copyText } from "@/lib/feedback"
import { SecretRequestError, useSecretRequest } from "./client"
import { Panel } from "./panel"

const HOURS = ["1", "24", "168"] as const

export function SecretSharing({ group }: { group: SecretDetail }) {
  const t = useTranslations("Secrets")
  const coreT = useTranslations("Core")
  const format = useFormatter()
  const secretRequest = useSecretRequest()
  const router = useRouter()
  const [link, setLink] = useState("")
  const [hours, setHours] = useState<(typeof HOURS)[number]>("24")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  async function copyLink() {
    await copyText(link, { success: coreT("linkCopied"), error: coreT("copyError") })
  }
  return (
    <Panel title={t("sharing")} description={t("sharing_description")}>
      <div className="flex flex-col gap-4">
        <form
          autoComplete="off"
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy("create")
            setError("")
            const form = event.currentTarget
            const data = new FormData(form)
            try {
              const result = z.object({ url: z.string().url() }).parse(
                await secretRequest({
                  operation: "share",
                  id: group.id,
                  input: { password: data.get("password"), hours: Number(hours) },
                }),
              )
              setLink(result.url)
              form.reset()
              router.refresh()
            } catch (error) {
              setError(error instanceof SecretRequestError ? error.message : t("create_link_error"))
            } finally {
              setBusy(null)
            }
          }}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="secret-share-password">{t("password")}</Label>
            <Input
              id="secret-share-password"
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              placeholder={t("password_hint")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span id="secret-share-hours" className="text-[13px] leading-[18px] font-medium">
              {t("expires_in")}
            </span>
            <SegmentedControl
              aria-labelledby="secret-share-hours"
              className="h-10 items-center"
              itemClassName="px-3 whitespace-nowrap"
              value={hours}
              onValueChange={setHours}
              options={[
                { value: "1", label: t("hour") },
                { value: "24", label: t("day") },
                { value: "168", label: t("week") },
              ]}
            />
          </div>
          <Button type="submit" size="lg" loading={busy === "create"}>
            {t("create_link")}
          </Button>
        </form>
        {link ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="secret-share-link">{t("protected_link")}</Label>
            <div className="flex gap-2">
              <Input
                id="secret-share-link"
                className="font-mono"
                readOnly
                value={link}
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button variant="outline" size="lg" onClick={copyLink}>
                <CopyIcon />
                {t("copy_link")}
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">{t("link_notice")}</p>
          </div>
        ) : null}
        <FormError message={error} />
        {group.shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("private_notice")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {group.shares.map((share) => (
              <li key={share.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-sm tabular-nums">
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
                  loading={busy === share.id}
                  onClick={async () => {
                    setBusy(share.id)
                    try {
                      await secretRequest({ operation: "revoke", id: group.id, shareId: share.id })
                      setLink("")
                      toast.success(t("link_revoked"))
                      router.refresh()
                    } catch {
                      setError(t("revoke_error"))
                    } finally {
                      setBusy(null)
                    }
                  }}
                >
                  {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
