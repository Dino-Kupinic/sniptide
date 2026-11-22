"use client"

import { Button } from "@sniptide/ui/components/button"
import { ChevronRight, Plus } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useFormStatus } from "react-dom"
import { ListHeader } from "@/components/lists/toolbar"
import { createBroadcastDraft } from "@/lib/broadcasts/actions"

export type BroadcastListRow = {
  id: string
  subject: string
  updatedAt: string
  sentAt: string | null
  recipients: number | null
}

function NewUpdateButton() {
  const t = useTranslations("Broadcasts")
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      <Plus aria-hidden />
      {t("newUpdate")}
    </Button>
  )
}

export function BroadcastList({
  subscribers,
  rows,
  now,
}: {
  subscribers: number
  rows: BroadcastListRow[]
  // The server's clock, so "edited 2 minutes ago" renders the same on the server and the client.
  now: string
}) {
  const t = useTranslations("Broadcasts")
  const format = useFormatter()
  const newUpdate = (
    <form action={createBroadcastDraft}>
      <NewUpdateButton />
    </form>
  )

  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <ListHeader
        title={t("title")}
        description={t("description", { count: subscribers })}
        actions={newUpdate}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="rounded-lg divide-y divide-border overflow-hidden border border-border">
          {rows.map((row) => {
            const sentAt = row.sentAt ? new Date(row.sentAt) : null
            const status = sentAt
              ? row.recipients === null
                ? t("sentOn", { date: format.dateTime(sentAt, { dateStyle: "medium" }) })
                : t("sentTo", {
                    count: row.recipients,
                    date: format.dateTime(sentAt, { dateStyle: "medium" }),
                  })
              : t("draft", { time: format.relativeTime(new Date(row.updatedAt), new Date(now)) })
            return (
              <li key={row.id}>
                <Link
                  href={`/settings/product-updates/${row.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {row.subject || t("untitled")}
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground">{status}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
