import { notFound } from "next/navigation"
import { PasteEditor } from "@/components/paste/paste-editor"
import { SetBreadcrumb } from "@/components/shell/breadcrumb"
import { formatDateTime } from "@/lib/format"
import { collections } from "@/lib/mock-data"
import { getPaste, getShare } from "@/lib/pastes/store"

export async function generateMetadata({ params }: PageProps<"/pastes/[slug]/edit">) {
  const paste = await getPaste((await params).slug)
  return { title: paste ? `Edit ${paste.title} · Sniptide` : "Paste not found · Sniptide" }
}

export default async function Page({ params }: PageProps<"/pastes/[slug]/edit">) {
  const { slug } = await params
  const paste = await getPaste(slug)
  if (!paste) notFound()

  const share = await getShare(slug)
  if (paste.owner && share?.access !== "edit") notFound()

  return (
    <>
      <SetBreadcrumb
        trail={[
          { label: "My pastes", href: "/pastes" },
          { label: paste.title, href: `/pastes/${slug}` },
          { label: "Edit" },
        ]}
      />
      <PasteEditor
        editing={slug}
        collections={collections}
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
    </>
  )
}
