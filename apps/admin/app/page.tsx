import type { Metadata } from "next"
import { connection } from "next/server"
import { AdminShell } from "@/components/admin-shell"
import { BroadcastList } from "@/components/broadcast-list"
import { listBroadcasts, subscriberCount } from "@/lib/store"

export const metadata: Metadata = { title: "Product updates · Sniptide admin" }

export default async function Page() {
  // The list reads the database on every request, never at build time.
  await connection()
  const [rows, subscribers] = await Promise.all([listBroadcasts(), subscriberCount()])
  return (
    <AdminShell>
      <BroadcastList
        subscribers={subscribers}
        now={new Date().toISOString()}
        rows={rows.map((row) => ({
          id: row.id,
          subject: row.subject,
          updatedAt: row.updatedAt.toISOString(),
          sentAt: row.sentAt?.toISOString() ?? null,
          recipients: row.recipients,
        }))}
      />
    </AdminShell>
  )
}
