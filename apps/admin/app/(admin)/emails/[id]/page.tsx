import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BroadcastEditor } from "@/components/broadcast-editor"
import { getConfig } from "@/lib/config"
import { getBroadcast, previewHtml, rowContent, subscriberCount } from "@/lib/store"

export const metadata: Metadata = { title: "Email · Sniptide admin" }

export default async function Page({ params }: PageProps<"/emails/[id]">) {
  const { id } = await params
  const row = await getBroadcast(id)
  if (!row) notFound()
  const content = rowContent(row)
  const [subscribers, html] = await Promise.all([
    subscriberCount(content.kind),
    previewHtml(content),
  ])
  return (
    <BroadcastEditor
      id={row.id}
      initial={content}
      initialHtml={html}
      subscribers={subscribers}
      email={getConfig().testTo}
      sent={
        row.sentAt ? { at: row.sentAt.toISOString(), recipients: row.recipients ?? null } : null
      }
    />
  )
}
