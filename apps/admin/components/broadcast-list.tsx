"use client"

import { Button } from "@sniptide/ui/components/button"
import { ChevronRight, Plus } from "lucide-react"
import Link from "next/link"
import { KIND_ICONS } from "@/components/kind-icon"
import { PageHeader } from "@/components/page-header"
import { formatDate, people, relativeTime } from "@/lib/format"
import { type EmailKind, KINDS } from "@/lib/kinds"

export type BroadcastListRow = {
  id: string
  kind: EmailKind
  subject: string
  updatedAt: string
  sentAt: string | null
  recipients: number | null
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
  const newEmail = (
    <Button render={<Link href="/emails/new" />} nativeButton={false}>
      <Plus aria-hidden />
      New email
    </Button>
  )

  return (
    <div className="flex flex-col gap-6 p-4 lg:gap-8 lg:p-7">
      <PageHeader
        title="Emails"
        description={
          subscribers === 0
            ? "No one has turned on product updates yet, so emails reach no one."
            : `Emails go to the ${people(subscribers)} who turned on product updates.`
        }
        actions={newEmail}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't written an email yet.</p>
      ) : (
        <ul className="rounded-lg divide-y divide-border overflow-hidden border border-border">
          {rows.map((row) => {
            const sentAt = row.sentAt ? new Date(row.sentAt) : null
            const status = sentAt
              ? row.recipients === null
                ? `Sent ${formatDate(sentAt)}`
                : `Sent ${formatDate(sentAt)} to ${people(row.recipients)}`
              : `Draft, edited ${relativeTime(new Date(row.updatedAt), new Date(now))}`
            const Icon = KIND_ICONS[row.kind]
            return (
              <li key={row.id}>
                <Link
                  href={`/emails/${row.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {row.subject || KINDS[row.kind].untitled}
                    </span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {KINDS[row.kind].name} · {status}
                    </span>
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
