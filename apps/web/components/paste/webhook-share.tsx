"use client"

import { Button } from "@sniptide/ui/components/button"
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
  const [pending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState("")
  if (targets.length === 0) return null
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-4 lg:px-6">
      <p className="text-sm font-medium">Share to a channel</p>
      <p className="text-xs text-muted-foreground">
        Post this link to your instance’s configured channel. Everyone in that channel will receive
        it.
      </p>
      <div className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <Button
            key={target}
            variant="outline"
            disabled={pending || !allowed}
            onClick={() => {
              setMessage("")
              startTransition(async () => {
                try {
                  const result = await shareToWebhook(slug, target)
                  setMessage(
                    result.ok
                      ? `Shared to ${target === "slack" ? "Slack" : "Discord"}.`
                      : result.error,
                  )
                } catch {
                  setMessage("Couldn't confirm delivery. Check the channel before trying again.")
                }
              })
            }}
          >
            Share to {target === "slack" ? "Slack" : "Discord"}
          </Button>
        ))}
      </div>
      {!allowed ? (
        <p className="text-xs text-muted-foreground">
          Use a public or unlisted paste without a password or one-time protection.
        </p>
      ) : null}
      <p role="status" className="text-xs">
        {pending ? "Sharing…" : message}
      </p>
    </div>
  )
}
