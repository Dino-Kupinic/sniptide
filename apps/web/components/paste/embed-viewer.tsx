"use client"

import { LogoMark } from "@sniptide/ui/components/logo"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "@sniptide/ui/lib/utils"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import type { HighlightedLines } from "@/lib/highlight/types"
import { CodeBlock } from "./code-block"
import { reportCopy, useCopy } from "./copy-button"
import { LanguageIcon } from "./language-icon"
import { panelToolClass } from "./side-panel"

interface EmbedFile {
  name: string
  language: string
  content: string
  lines?: HighlightedLines
}

// The paste card at /<slug>/embed, filling the iframe another site puts it in: the title (linking
// to the paste in a new tab), file tabs when there is more than one file, and the code, which
// scrolls inside the frame. Links leave the frame so the host page stays where it is.
export function EmbedViewer({
  slug,
  url,
  title,
  files,
}: {
  slug: string
  url: string
  title: string
  files: EmbedFile[]
}) {
  const t = useTranslations("Paste")
  const [activeName, setActiveName] = React.useState(files[0]?.name ?? "")
  const { copied, copy } = useCopy()
  const active = files.find((file) => file.name === activeName) ?? files[0]
  if (!active) return null

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-4">
        <LanguageIcon language={active.language} />
        <a
          href={url}
          target="_blank"
          rel="noopener"
          title={title}
          className="min-w-0 flex-1 truncate text-sm font-medium outline-none hover:underline focus-visible:underline"
        >
          {title}
        </a>
        <button
          type="button"
          aria-label={copied ? t("copied") : t("copyFileContents")}
          onClick={async () => {
            if (await copy(active.content)) reportCopy(slug)
          }}
          className={panelToolClass}
        >
          {copied ? <SuccessCheck /> : <CopyIcon />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener"
          aria-label={t("openOnSniptide")}
          className={panelToolClass}
        >
          <LogoMark className="size-4" />
        </a>
      </div>

      {files.length > 1 ? (
        <div
          role="tablist"
          aria-label={t("files")}
          className="flex h-11 shrink-0 overflow-x-auto border-b border-border"
        >
          {files.map((file) => {
            const selected = file.name === active.name
            return (
              <button
                key={file.name}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveName(file.name)}
                className={cn(
                  "flex shrink-0 items-center border-r border-border px-4 font-mono text-[13px] outline-none focus-visible:underline",
                  selected
                    ? "text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                    : "text-muted-foreground",
                )}
              >
                {file.name}
              </button>
            )
          })}
        </div>
      ) : null}

      <CodeBlock
        content={active.content}
        highlighted={active.lines}
        className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto bg-sidebar"
      />
    </div>
  )
}
