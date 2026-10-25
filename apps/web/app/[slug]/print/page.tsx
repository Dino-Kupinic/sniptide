import { notFound, redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CodeBlock } from "@/components/paste/code-block"
import { PrintToolbar } from "@/components/paste/print-toolbar"
import { byteLength, formatBytes, formatDateTime, lineCount } from "@/lib/format"
import { highlightFiles } from "@/lib/highlight/highlight"
import { getLanguage } from "@/lib/pastes/languages"
import { readSharedPaste } from "@/lib/pastes/store"
import { getSiteOrigin } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/[slug]/print">) {
  const { slug } = await params
  const read = await readSharedPaste(slug)
  return {
    title: read.status === "ok" ? `${read.paste.title} · Sniptide` : "Sniptide",
    robots: { index: false, follow: false },
  }
}

// /<slug>/print: the paste as a document for paper or PDF, with its title, author and every file
// in full with wrapped lines. Same access as the share page, and it always renders in the light
// theme (see ThemeProvider). Printing doesn't count a view, and a one-time paste only prints for
// its owner, since anyone else would burn it here.
export default async function Page({ params }: PageProps<"/[slug]/print">) {
  const { slug } = await params
  const read = await readSharedPaste(slug)
  if (read.status === "missing") notFound()
  if (read.status !== "ok") redirect(`/${slug}`)

  const [t, locale, files, { host }] = await Promise.all([
    getTranslations("Core"),
    getLocale(),
    highlightFiles(read.paste.files),
    getSiteOrigin(),
  ])
  const { paste } = read

  return (
    <main className="mx-auto flex w-full max-w-[800px] flex-col gap-6 px-4 py-8 print:max-w-none print:p-0">
      <PrintToolbar backHref={`/${slug}`} />
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-[30px] leading-9 font-bold tracking-[-0.02em]">
          {paste.title}
        </h1>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <span className="text-foreground">@{paste.author.username}</span>
          <span>{t("edited", { time: formatDateTime(paste.updatedAt, locale) })}</span>
          <span className="font-mono">
            {host}/{paste.slug}
          </span>
        </p>
      </header>
      {files.map((file) => (
        <section key={file.name} className="flex flex-col gap-2">
          <h2 className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-mono font-medium">{file.name}</span>
            <span className="text-muted-foreground">
              {getLanguage(file.language).name} ·{" "}
              {t("lineSize", {
                count: lineCount(file.content),
                size: formatBytes(byteLength(file.content), locale),
              })}
            </span>
          </h2>
          <CodeBlock
            content={file.content}
            highlighted={file.lines}
            wrap
            className="overflow-visible rounded-lg border border-border px-4 py-3"
          />
        </section>
      ))}
    </main>
  )
}
