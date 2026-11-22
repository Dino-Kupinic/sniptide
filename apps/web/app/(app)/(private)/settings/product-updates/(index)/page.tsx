import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { BroadcastList } from "@/components/broadcasts/broadcast-list"
import { requireSession } from "@/lib/auth"
import { broadcastSender, listBroadcasts, subscriberCount } from "@/lib/broadcasts/store"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Broadcasts")
  return { title: `${t("title")} · Sniptide`, robots: { index: false, follow: false } }
}

export default async function Page() {
  const session = await requireSession()
  if (!broadcastSender(session.user)) notFound()
  const [rows, subscribers] = await Promise.all([listBroadcasts(), subscriberCount()])
  return (
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
  )
}
