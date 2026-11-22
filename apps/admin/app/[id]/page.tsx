import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AdminShell } from "@/components/admin-shell"
import { BroadcastEditor } from "@/components/broadcast-editor"
import { getConfig } from "@/lib/config"
import { getBroadcast, previewHtml, subscriberCount } from "@/lib/store"

export const metadata: Metadata = { title: "Product update · Sniptide admin" }

export default async function Page({ params }: PageProps<"/[id]">) {
  const { id } = await params
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
    <AdminShell>
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
    </AdminShell>
  )
}
