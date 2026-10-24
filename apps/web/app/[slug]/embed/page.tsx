import { notFound } from "next/navigation"
import { EmbedViewer } from "@/components/paste/embed-viewer"
import { highlightFiles } from "@/lib/highlight/highlight"
import { readEmbedPaste } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/[slug]/embed">) {
  const paste = await readEmbedPaste((await params).slug)
  return {
    title: paste ? `${paste.title} · Sniptide` : "Sniptide",
    // The paste's own page is the one to index; the embed only repeats it inside other sites.
    robots: { index: false, follow: false },
  }
}

// /<slug>/embed, the one page other sites may frame (see next.config.ts). Only public and
// unlisted pastes without a password or one-time protection open here.
export default async function Page({ params }: PageProps<"/[slug]/embed">) {
  const { slug } = await params
  const paste = await readEmbedPaste(slug)
  if (!paste) notFound()
  const [files, { origin }] = await Promise.all([highlightFiles(paste.files), getSiteOrigin()])

  return (
    <main>
      <h1 className="sr-only">{paste.title}</h1>
      <EmbedViewer slug={slug} url={`${origin}/${slug}`} title={paste.title} files={files} />
    </main>
  )
}
