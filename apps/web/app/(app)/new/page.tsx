import { getTranslations } from "next-intl/server"
import { PasteEditor } from "@/components/paste/paste-editor"
import { getPreferences, getSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import { fetchImport, importSource, importTitle, readImportFiles } from "@/lib/integrations/imports"
import { limited, limits } from "@/lib/pastes/limits"
import { suggestedVisibility } from "@/lib/pastes/smart-defaults"
import { getPaste } from "@/lib/pastes/store"
import { templateDraft } from "@/lib/pastes/templates"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("new")} · Sniptide` }
}

type Draft = {
  title: string
  description: string
  files: { name: string; content: string }[]
}

// The chosen files of a gist, for the import sheet's "Open in editor". Only the gist id
// and the file names travel in the URL; the text is read here, and nothing is saved.
async function gistDraft(
  link: string,
  names: string[],
): Promise<{ draft: Draft } | { error: string }> {
  const session = await getSession()
  const source = importSource("github")
  const id = source?.parseId(link)
  if (!session || !source || !id || names.length === 0)
    return { error: await actionError("gistUnreadable") }

  const tooOften = await limited(limits.gist(session.user.id))
  if (tooOften) return { error: await translateActionError(tooOften) }

  const result = await fetchImport("github", session.user.id, id)
  if (!result.ok) return { error: await translateActionError(result.error) }
  const read = await readImportFiles(result.item, names)
  if (!read.ok) return { error: await translateActionError(read.error) }

  return {
    draft: {
      title: importTitle(source, result.item, read.files[0]?.name),
      description: source.describe(result.item),
      files: read.files,
    },
  }
}

// `?from=<slug>` starts from a copy of an existing paste (the Duplicate action).
// `?gist=<id>&file=<name>…` starts from files of a gist (the import sheet).
// `?template=<name>` starts from a template on the marketing site (Use template on its page).
export default async function Page({ searchParams }: PageProps<"/new">) {
  const { from, gist, file, template, title } = await searchParams
  const [copied, preferences, collections, imported, templated, session, t] = await Promise.all([
    typeof from === "string" ? getPaste(from) : null,
    getPreferences(),
    listCollections(),
    typeof gist === "string" ? gistDraft(gist, [file ?? []].flat()) : null,
    typeof template === "string" ? templateDraft(template) : null,
    getSession(),
    getTranslations("Core"),
  ])
  // An encrypted paste's files are ciphertext, so there is nothing to start a copy from.
  const source = copied?.encryptionKeyId ? null : copied
  const draft = (imported && "draft" in imported ? imported.draft : null) ?? templated
  const files =
    draft?.files ??
    (source
      ? source.files.map(({ name, content }) => ({ name, content }))
      : [{ name: "untitled.txt", content: "" }])

  return (
    <PasteEditor
      collections={collections}
      handle={session?.user.username}
      // A copy, an import or a template starts from other text, so its draft is kept apart from a
      // blank paste.
      draftScope={[
        session?.user.id ?? "",
        source ? `from:${source.slug}` : "",
        typeof gist === "string" ? `gist:${gist}` : "",
        templated && typeof template === "string" ? `template:${template}` : "",
      ].join(":")}
      indentation={preferences.indentation}
      lineNumbers={preferences.lineNumbers}
      secretDetection={preferences.secretDetection}
      notice={imported && "error" in imported ? imported.error : undefined}
      initial={{
        // ?title= names a blank paste, as the command menu's "New paste named" action does.
        title:
          draft?.title ??
          (source
            ? t("copyOf", { title: source.title })
            : typeof title === "string"
              ? title.slice(0, 200)
              : ""),
        description: draft?.description ?? source?.description ?? "",
        files,
        visibility: suggestedVisibility(files, source?.visibility ?? preferences.defaultVisibility),
        expiry: preferences.defaultExpiry,
        slug: "",
        // A copy of a paste shared with the viewer can't go in its owner's collection.
        collection: source && !source.owner ? source.collection : null,
        hasPassword: false,
        burnAfterRead: source ? false : preferences.defaultBurnAfterRead,
      }}
    />
  )
}
