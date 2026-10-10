import { notFound } from "next/navigation"
import { PasteEditor } from "@/components/paste/paste-editor"
import { getPreferences } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { formatDateTime } from "@/lib/format"
import { getOwnPaste, getShare } from "@/lib/pastes/store"

export async function generateMetadata({ params }: PageProps<"/pastes/[slug]/edit">) {
  const paste = await getOwnPaste((await params).slug)
  return { title: paste ? `Edit ${paste.title} · Sniptide` : "Paste not found · Sniptide" }
}

export default async function Page({ params }: PageProps<"/pastes/[slug]/edit">) {
  const { slug } = await params
  const paste = await getOwnPaste(slug)
  if (!paste) notFound()

  const [share, preferences, collections] = await Promise.all([
    getShare(slug),
    getPreferences(),
    listCollections(),
  ])
  if (paste.owner && share?.access !== "edit") notFound()

  return (
    <PasteEditor
      editing={slug}
      collections={collections}
      indentation={preferences.indentation}
      secretDetection={preferences.secretDetection}
      currentExpiry={
        paste.expiresAt ? `expires ${formatDateTime(paste.expiresAt)}` : "never expires"
      }
      initial={{
        title: paste.title,
        description: paste.description,
        files: paste.files.map(({ name, content }) => ({ name, content })),
        visibility: paste.visibility,
        expiry: "keep",
        slug,
        collection: paste.collection,
        hasPassword: Boolean(paste.password),
        burnAfterRead: paste.burnAfterRead,
      }}
    />
  )
}
