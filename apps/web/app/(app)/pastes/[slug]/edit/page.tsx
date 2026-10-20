import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { PasteEditor } from "@/components/paste/paste-editor"
import { getPreferences, getSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getPaste, getShare } from "@/lib/pastes/store"

export async function generateMetadata({ params }: PageProps<"/pastes/[slug]/edit">) {
  const paste = await getPaste((await params).slug)
  const t = await getTranslations("Core")
  return {
    title: `${paste ? t("editTitle", { title: paste.title }) : t("pasteNotFound")} · Sniptide`,
  }
}

export default async function Page({ params }: PageProps<"/pastes/[slug]/edit">) {
  const { slug } = await params
  const paste = await getPaste(slug)
  if (!paste) notFound()

  const [share, preferences, collections, session] = await Promise.all([
    getShare(slug),
    getPreferences(),
    listCollections(),
    getSession(),
  ])
  const shared = Boolean(paste.owner)
  if (shared && share?.access !== "edit") notFound()

  return (
    <PasteEditor
      editing={slug}
      sharedEdit={shared}
      collections={collections}
      draftScope={session?.user.id ?? ""}
      indentation={preferences.indentation}
      secretDetection={preferences.secretDetection}
      currentExpiresAt={paste.expiresAt}
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
        version: paste.version,
      }}
    />
  )
}
