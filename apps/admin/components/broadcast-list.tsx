"use client"

import { Button } from "@sniptide/ui/components/button"
import { ChevronRight, Plus } from "lucide-react"
import Link from "next/link"
import { useFormStatus } from "react-dom"
import { PageHeader } from "@/components/page-header"
import { createBroadcastDraft } from "@/lib/actions"
import { formatDate, people, relativeTime } from "@/lib/format"

export type BroadcastListRow = {
  id: string
  subject: string
  updatedAt: string
  sentAt: string | null
  recipients: number | null
}

function NewUpdateButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      <Plus aria-hidden />
      New update
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
  const newUpdate = (
    <form action={createBroadcastDraft}>
      <NewUpdateButton />
    </form>
  )

  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <PageHeader
        title="Product updates"
        description={
          subscribers === 0
            ? "No one has turned on product updates yet."
            : `${people(subscribers)} ${subscribers === 1 ? "gets" : "get"} these emails.`
        }
        actions={newUpdate}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't written a product update yet.</p>
      ) : (
        <ul className="rounded-lg divide-y divide-border overflow-hidden border border-border">
          {rows.map((row) => {
            const sentAt = row.sentAt ? new Date(row.sentAt) : null
            const status = sentAt
              ? row.recipients === null
                ? `Sent ${formatDate(sentAt)}`
                : `Sent ${formatDate(sentAt)} to ${people(row.recipients)}`
              : `Draft, edited ${relativeTime(new Date(row.updatedAt), new Date(now))}`
            return (
              <li key={row.id}>
                <Link
                  href={`/${row.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {row.subject || "Untitled update"}
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
