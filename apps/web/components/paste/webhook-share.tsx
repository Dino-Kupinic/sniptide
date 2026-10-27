"use client"

import { Button } from "@sniptide/ui/components/button"
import { FormError } from "@sniptide/ui/components/form-error"
import { toast } from "@sniptide/ui/components/toast"
import { useTranslations } from "next-intl"
import * as React from "react"
import { shareToWebhook } from "@/lib/pastes/webhook-actions"
import type { WebhookTarget } from "@/lib/pastes/webhook-url"

export function WebhookShare({
  slug,
  targets,
  allowed,
}: {
  slug: string
  targets: WebhookTarget[]
  allowed: boolean
}) {
  const t = useTranslations("Paste")
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [sharing, setSharing] = React.useState<WebhookTarget | null>(null)
  if (targets.length === 0) return null
  return (
    <details className="group border-t border-border px-4 py-3 lg:px-6">
      <summary className="cursor-pointer text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
        {t("shareToAChannel")}
      </summary>
      <div className="flex flex-col gap-3 pt-3">
        <p className="text-xs text-muted-foreground">{t("postThisLinkToYourInstance")}</p>
        <div className="flex flex-wrap gap-2">
          {targets.map((target) => (
            <Button
              key={target}
              variant="outline"
              disabled={!allowed || (pending && sharing !== target)}
              loading={pending && sharing === target}
              onClick={() => {
                setError(null)
                setSharing(target)
                startTransition(async () => {
                  try {
                    const result = await shareToWebhook(slug, target)
                    if (result.ok)
                      toast.success(
                        t("sharedTo", { target: target === "slack" ? "Slack" : "Discord" }),
                      )
                    else setError(result.error)
                  } catch {
                    setError(t("couldnTConfirmDeliveryCheckThe"))
                  }
                })
              }}
            >
              {t("shareTo", { target: target === "slack" ? "Slack" : "Discord" })}
            </Button>
          ))}
        </div>
        {!allowed ? (
          <p className="text-xs text-muted-foreground">{t("useAPublicOrUnlistedPaste")}</p>
        ) : null}
        <FormError variant="inline" message={error} className="text-xs" />
      </div>
    </details>
  )
}
