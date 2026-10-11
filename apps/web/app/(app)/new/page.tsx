import { PasteEditor } from "@/components/paste/paste-editor"
import { getPreferences, getSession } from "@/lib/auth"
import { listCollections } from "@/lib/collections/store"
import {
  fetchGist,
  gistDescription,
  gistTitle,
  parseGistId,
  readGistFiles,
} from "@/lib/pastes/gist"
import { limited, limits } from "@/lib/pastes/limits"
import { getOwnPaste } from "@/lib/pastes/store"

export const metadata = { title: "New paste · Sniptide" }

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
  if (!session || !id || names.length === 0) return { error: "That gist couldn't be opened." }

  const tooOften = await limited(limits.gist(session.user.id))
  if (tooOften) return { error: tooOften }

  const result = await fetchGist(id)
  if (!result.ok) return { error: result.error }
  const read = await readGistFiles(result.gist, names)
  if (!read.ok) return { error: read.error }

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
  const { from, gist, file } = await searchParams
  const [source, preferences, collections, imported] = await Promise.all([
    typeof from === "string" ? getOwnPaste(from) : null,
    getPreferences(),
    listCollections(),
    typeof gist === "string" ? gistDraft(gist, [file ?? []].flat()) : null,
  ])
  const draft = imported && "draft" in imported ? imported.draft : null

  return (
    <PasteEditor
      collections={collections}
      indentation={preferences.indentation}
      secretDetection={preferences.secretDetection}
      notice={imported && "error" in imported ? imported.error : undefined}
      initial={{
        title: draft?.title ?? (source ? `Copy of ${source.title}` : ""),
        description: draft?.description ?? source?.description ?? "",
        files:
          draft?.files ??
          (source
            ? source.files.map(({ name, content }) => ({ name, content }))
            : [{ name: "untitled.txt", content: "" }]),
        visibility: source?.visibility ?? preferences.defaultVisibility,
        expiry: preferences.defaultExpiry,
        slug: "",
        collection: source?.collection ?? null,
        hasPassword: false,
        burnAfterRead: source ? false : preferences.defaultBurnAfterRead,
      }}
    />
  )
}
