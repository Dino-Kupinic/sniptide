import { getTranslations } from "next-intl/server"
import { PasteEditor } from "@/components/paste/paste-editor"
import { getPreferences, getSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import { actionError, translateActionError } from "@/lib/i18n/action-errors"
import {
  fetchGist,
  gistDescription,
  gistTitle,
  parseGistId,
  readGistFiles,
} from "@/lib/pastes/gist"
import { limited, limits } from "@/lib/pastes/limits"
import { getPaste } from "@/lib/pastes/store"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("new")} · Sniptide` }
}

type Draft = {
  title: string
  description: string
  files: { name: string; content: string }[]
}

// The chosen files of a public gist, for the import sheet's "Open in editor". Only the gist id
// and the file names travel in the URL; the text is read here, and nothing is saved.
async function gistDraft(
  link: string,
  names: string[],
): Promise<{ draft: Draft } | { error: string }> {
  const session = await getSession()
  const id = parseGistId(link)
  if (!session || !id || names.length === 0) return { error: await actionError("gistUnreadable") }

  const tooOften = await limited(limits.gist(session.user.id))
  if (tooOften) return { error: await translateActionError(tooOften) }

  const result = await fetchGist(id)
  if (!result.ok) return { error: await translateActionError(result.error) }
  const read = await readGistFiles(result.gist, names)
  if (!read.ok) return { error: await translateActionError(read.error) }

  return {
    draft: {
      title: gistTitle(result.gist, read.files[0]?.name),
      description: gistDescription(result.gist),
      files: read.files,
    },
  }
}

// `?from=<slug>` starts from a copy of an existing paste (the Duplicate action).
// `?gist=<id>&file=<name>…` starts from files of a public gist (the import sheet).
export default async function Page({ searchParams }: PageProps<"/new">) {
  const t = await getTranslations("Core")
  const { from, gist, file } = await searchParams
  const [source, preferences, collections, imported, session] = await Promise.all([
    typeof from === "string" ? getPaste(from) : null,
    getPreferences(),
    listCollections(),
    typeof gist === "string" ? gistDraft(gist, [file ?? []].flat()) : null,
    getSession(),
  ])
  const draft = imported && "draft" in imported ? imported.draft : null

  return (
    <PasteEditor
      collections={collections}
      // A copy or an import starts from other text, so its draft is kept apart from a blank paste.
      draftScope={[
        session?.user.id ?? "",
        source ? `from:${source.slug}` : "",
        typeof gist === "string" ? `gist:${gist}` : "",
      ].join(":")}
      indentation={preferences.indentation}
      lineNumbers={preferences.lineNumbers}
      secretDetection={preferences.secretDetection}
      notice={imported && "error" in imported ? imported.error : undefined}
      initial={{
        title: draft?.title ?? (source ? t("copyOf", { title: source.title }) : ""),
        description: draft?.description ?? source?.description ?? "",
        files:
          draft?.files ??
          (source
            ? source.files.map(({ name, content }) => ({ name, content }))
            : [{ name: "untitled.txt", content: "" }]),
        visibility: source?.visibility ?? preferences.defaultVisibility,
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
