import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor"
import { requireSession } from "@/lib/auth"
import { broadcastSender, getBroadcast, previewHtml, subscriberCount } from "@/lib/broadcasts/store"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Broadcasts")
  return { title: `${t("title")} · Sniptide`, robots: { index: false, follow: false } }
}

export default async function Page({ params }: PageProps<"/settings/product-updates/[id]">) {
  const [session, { id }] = await Promise.all([requireSession(), params])
  if (!broadcastSender(session.user)) notFound()
  const row = await getBroadcast(id)
  if (!row) notFound()
  const content = {
    subject: row.subject,
    preview: row.preview,
    label: row.label,
    imageUrl: row.imageUrl,
    body: row.body,
  }
  const [subscribers, html] = await Promise.all([subscriberCount(), previewHtml(content)])
  return (
    <BroadcastEditor
      id={row.id}
      initial={content}
      initialHtml={html}
      subscribers={subscribers}
      email={session.user.email}
      sent={
        row.sentAt ? { at: row.sentAt.toISOString(), recipients: row.recipients ?? null } : null
      }
    />
  )
}
