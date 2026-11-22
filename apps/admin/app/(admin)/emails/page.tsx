import type { Metadata } from "next"
import { connection } from "next/server"
import { BroadcastList } from "@/components/broadcast-list"
import { isEmailKind } from "@/lib/kinds"
import { listBroadcasts, subscriberCount } from "@/lib/store"

export const metadata: Metadata = { title: "Emails · Sniptide admin" }

export default async function Page() {
  // The list reads the database on every request, never at build time.
  await connection()
  const [rows, subscribers] = await Promise.all([listBroadcasts(), subscriberCount()])
  return (
    <BroadcastList
      subscribers={subscribers}
      now={new Date().toISOString()}
      rows={rows.map((row) => ({
        id: row.id,
        kind: isEmailKind(row.kind) ? row.kind : "update",
        subject: row.subject,
        updatedAt: row.updatedAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        recipients: row.recipients,
      }))}
    />
  )
}
