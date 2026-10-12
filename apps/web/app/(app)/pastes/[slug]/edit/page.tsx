import { notFound } from "next/navigation"
import { PasteEditor } from "@/components/paste/paste-editor"
import { getPreferences } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { formatDateTime } from "@/lib/format"
import { getPaste, getShare } from "@/lib/pastes/store"

export async function generateMetadata({ params }: PageProps<"/pastes/[slug]/edit">) {
  const paste = await getPaste((await params).slug)
  return { title: paste ? `Edit ${paste.title} · Sniptide` : "Paste not found · Sniptide" }
}

export default async function Page({ params }: PageProps<"/pastes/[slug]/edit">) {
  const { slug } = await params
  const paste = await getPaste(slug)
  if (!paste) notFound()

  const [share, preferences, collections] = await Promise.all([
    getShare(slug),
    getPreferences(),
    listCollections(),
  ])
  const shared = Boolean(paste.owner)
  if (shared && share?.access !== "edit") notFound()

  return (
    <PasteEditor
      editing={slug}
      sharedEdit={shared}
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
        // The owner's collection isn't one of the viewer's.
        collection: shared ? null : paste.collection,
        hasPassword: Boolean(paste.password),
        burnAfterRead: paste.burnAfterRead,
      }}
    />
  )
}
