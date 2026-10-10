"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react"
import * as React from "react"
import type { HighlightedLines } from "@/lib/highlight/types"
import { CodeBlock } from "./code-block"
import { useCopy } from "./copy-button"
import { LanguageMarker } from "./language-marker"

interface ViewerFile {
  name: string
  language: string
  content: string
  // Syntax-coloured lines from highlightFiles; plain code without them.
  lines?: HighlightedLines
}

const toolClass =
  "inline-flex h-8 items-center gap-1.5 px-2.5 text-[13px] text-foreground/85 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4"

// Code card on the paste pages: file tabs (or the single file name), Raw / Wrap / Download /
// Copy, the code, and an optional footer. `collapseAt` shows only the first lines below the lg
// breakpoint, wrapped, with a "Show full file" button, as on the mobile artboards. The collapse
// is CSS-only so the same render serves desktop and mobile.
export function FileViewer({
  slug,
  files,
  footer,
  collapseAt,
  rawAllowed = true,
  lineNumbers = true,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
}: {
  slug: string
  files: ViewerFile[]
  footer?: React.ReactNode
  collapseAt?: number
  rawAllowed?: boolean
  lineNumbers?: boolean
  className?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
}) {
  const [activeName, setActiveName] = React.useState(files[0]?.name ?? "")
  const [wrap, setWrap] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const { copied, copy } = useCopy()
  const active = files.find((file) => file.name === activeName) ?? files[0]
  if (!active) return null

  const rawHref = `/${slug}/raw?file=${encodeURIComponent(active.name)}`
  const lines = active.content.replace(/\n$/, "").split("\n").length
  const collapsed = collapseAt !== undefined && !expanded && lines > collapseAt

  return (
    <div className={cn("flex min-w-0 flex-col border border-border", className)}>
      <div
        className={cn(
          "flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border pr-1.5",
          headerClassName,
        )}
      >
        <div role="tablist" aria-label="Files" className="flex h-full min-w-0 overflow-x-auto">
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
                  "flex shrink-0 items-center gap-2 px-4 font-mono text-[13px] outline-none focus-visible:underline",
                  files.length > 1 && "border-r border-border",
                  files.length > 1 && selected && "shadow-[inset_0_2px_0_var(--primary)]",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <LanguageMarker language={file.language} className="hidden lg:block" />
                {file.name}
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center">
          {rawAllowed ? (
            <a href={rawHref} className={toolClass}>
              Raw
            </a>
          ) : null}
          <button
            type="button"
            aria-pressed={wrap}
            onClick={() => setWrap((value) => !value)}
            className={cn(toolClass, wrap && "text-link")}
          >
            Wrap
          </button>
          {rawAllowed ? (
            <a
              href={`${rawHref}&download=1`}
              aria-label={`Download ${active.name}`}
              className={cn(toolClass, "hidden lg:inline-flex")}
            >
              <DownloadIcon />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => copy(active.content)}
            className={cn(toolClass, "hidden bg-muted lg:inline-flex")}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      <CodeBlock
        content={active.content}
        highlighted={active.lines}
        wrap={wrap || (collapseAt !== undefined && "mobile")}
        mobileMaxLines={collapsed ? collapseAt : undefined}
        lineNumbers={lineNumbers}
        className={cn("flex-1", bodyClassName)}
      />

      {collapsed ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="h-11 border-t border-border text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
        >
          Show full file
        </button>
      ) : null}

      {footer ? (
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground",
            footerClassName,
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}
