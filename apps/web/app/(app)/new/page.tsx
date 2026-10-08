import { PasteEditor } from "@/components/paste/paste-editor"
import { SetBreadcrumb } from "@/components/shell/breadcrumb"
import { collections } from "@/lib/mock-data"
import { getPaste } from "@/lib/pastes/store"

export const metadata = { title: "New paste · Sniptide" }

// `?from=<slug>` starts from a copy of an existing paste (the Duplicate action).
export default async function Page({ searchParams }: PageProps<"/new">) {
  const from = (await searchParams).from
  const source = typeof from === "string" ? await getPaste(from) : null

  return (
    <>
      <SetBreadcrumb trail={[{ label: "My pastes", href: "/pastes" }, { label: "New paste" }]} />
      <PasteEditor
        collections={collections}
        initial={{
          title: source ? `Copy of ${source.title}` : "",
          description: source?.description ?? "",
          files: source
            ? source.files.map(({ name, content }) => ({ name, content }))
            : [{ name: "untitled.txt", content: "" }],
          visibility: source?.visibility ?? "unlisted",
          expiry: "1w",
          slug: "",
          collection: source?.collection ?? null,
          hasPassword: false,
          burnAfterRead: false,
        }}
      />
    </>
  )
}
