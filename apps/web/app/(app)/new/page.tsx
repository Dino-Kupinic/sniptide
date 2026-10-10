import { PasteEditor } from "@/components/paste/paste-editor"
import { SetBreadcrumb } from "@/components/shell/breadcrumb"
import { getPreferences } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { getOwnPaste } from "@/lib/pastes/store"

export const metadata = { title: "New paste · Sniptide" }

// `?from=<slug>` starts from a copy of an existing paste (the Duplicate action).
export default async function Page({ searchParams }: PageProps<"/new">) {
  const from = (await searchParams).from
  const [source, preferences, collections] = await Promise.all([
    typeof from === "string" ? getOwnPaste(from) : null,
    getPreferences(),
    listCollections(),
  ])

  return (
    <>
      <SetBreadcrumb trail={[{ label: "My pastes", href: "/pastes" }, { label: "New paste" }]} />
      <PasteEditor
        collections={collections}
        indentation={preferences.indentation}
        secretDetection={preferences.secretDetection}
        initial={{
          title: source ? `Copy of ${source.title}` : "",
          description: source?.description ?? "",
          files: source
            ? source.files.map(({ name, content }) => ({ name, content }))
            : [{ name: "untitled.txt", content: "" }],
          visibility: source?.visibility ?? preferences.defaultVisibility,
          expiry: preferences.defaultExpiry,
          slug: "",
          collection: source?.collection ?? null,
          hasPassword: false,
          burnAfterRead: source ? false : preferences.defaultBurnAfterRead,
        }}
      />
    </>
  )
}
