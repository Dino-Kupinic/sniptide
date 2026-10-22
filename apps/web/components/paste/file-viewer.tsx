"use client"

import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { cn } from "@sniptide/ui/lib/utils"
import { CopyIcon, DownloadIcon, FileCodeIcon, WrapTextIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import * as React from "react"
import type { HighlightedLines } from "@/lib/highlight/types"
import { CodeBlock } from "./code-block"
import { reportCopy, useCopy } from "./copy-button"
import { LanguageMarker } from "./language-marker"
import { panelToolClass, SidePanelToggle } from "./side-panel"

interface ViewerFile {
  name: string
  language: string
  content: string
  // Syntax-coloured lines from highlightFiles; plain code without them.
  lines?: HighlightedLines
}

// The file open in the code card, for actions that live outside it (the mobile bottom bar's Copy
// code, Download in the overflow menu). The card reports its active tab here when a provider wraps
// the page.
const ActiveFileContext = React.createContext<{
  file: Pick<ViewerFile, "name" | "content"> | null
  setFile: (file: Pick<ViewerFile, "name" | "content">) => void
} | null>(null)

export function ActiveFileProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = React.useState<Pick<ViewerFile, "name" | "content"> | null>(null)
  const value = React.useMemo(() => ({ file, setFile }), [file])
  return <ActiveFileContext.Provider value={value}>{children}</ActiveFileContext.Provider>
}

export function useActiveFile() {
  return React.useContext(ActiveFileContext)?.file ?? null
}

const desktopQuery = "(min-width: 1024px)"
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(desktopQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

// Whether the lg layout is showing. The server renders the desktop answer.
function useDesktop() {
  return React.useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  )
}

// Code card on the paste pages: file tabs (or the single file name), icon buttons for Wrap /
// Raw / Download / Copy (named in tooltips), the side panel toggle, the code, and an optional
// footer. `collapseAt` shows only the first lines below the lg
// breakpoint, wrapped, with a "Show full file" button, as on the mobile artboards. The collapse
// is CSS-only so the same render serves desktop and mobile. Download sits in the page's menus on
// phones, so the bar there holds Wrap, Raw and Copy.
export function FileViewer({
  slug,
  files,
  footer,
  collapseAt,
  rawAllowed = true,
  lineNumbers = true,
  panelToggle = false,
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
  // Shows the side panel toggle; needs a SidePanelProvider around the card and its panel.
  panelToggle?: boolean
  className?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
}) {
  const t = useTranslations("Paste")
  const [activeName, setActiveName] = React.useState(files[0]?.name ?? "")
  // null until the toggle is used: a card that collapses on phones wraps there and not on desktop.
  const [wrapChoice, setWrapChoice] = React.useState<boolean | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const { copied, copy } = useCopy()
  const desktop = useDesktop()
  const report = React.useContext(ActiveFileContext)?.setFile
  const active = files.find((file) => file.name === activeName) ?? files[0]
  React.useEffect(() => {
    if (active) report?.({ name: active.name, content: active.content })
  }, [active, report])
  if (!active) return null
  const wrap = wrapChoice ?? (collapseAt !== undefined && !desktop)

  const rawHref = `/${slug}/raw?file=${encodeURIComponent(active.name)}`
  const lines = active.content.replace(/\n$/, "").split("\n").length
  const collapsed = collapseAt !== undefined && !expanded && lines > collapseAt

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg flex min-w-0 flex-col border border-border",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border pr-1.5",
          headerClassName,
        )}
      >
        <div role="tablist" aria-label={t("files")} className="flex h-full min-w-0 overflow-x-auto">
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
                  files.length > 1 && selected && "shadow-[inset_0_-2px_0_var(--primary)]",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <LanguageMarker language={file.language} className="hidden lg:block" />
                {file.name}
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tool label={wrap ? t("donTWrapLines") : t("wrapLines")}>
            <button
              type="button"
              aria-label={t("wrapLines")}
              aria-pressed={wrap}
              onClick={() => setWrapChoice(!wrap)}
              className={panelToolClass}
            >
              <WrapTextIcon />
            </button>
          </Tool>
          {rawAllowed ? (
            <Tool label={t("viewRaw")}>
              <a href={rawHref} aria-label={t("viewRaw")} className={panelToolClass}>
                <FileCodeIcon />
              </a>
            </Tool>
          ) : null}
          {rawAllowed ? (
            <Tool label={t("download")}>
              <a
                href={`${rawHref}&download=1`}
                aria-label={t("downloadFile", { name: active.name })}
                className={cn(panelToolClass, "hidden lg:inline-flex")}
              >
                <DownloadIcon />
              </a>
            </Tool>
          ) : null}
          <Tool label={copied ? t("copied") : t("copy")}>
            <button
              type="button"
              aria-label={t("copyFileContents")}
              onClick={async () => {
                if (await copy(active.content)) reportCopy(slug)
              }}
              className={panelToolClass}
            >
              {copied ? <SuccessCheck /> : <CopyIcon />}
            </button>
          </Tool>
          <span aria-live="polite" className="sr-only">
            {copied ? t("copied") : ""}
          </span>
          {panelToggle ? <SidePanelToggle /> : null}
        </div>
      </div>

      <CodeBlock
        content={active.content}
        highlighted={active.lines}
        wrap={wrapChoice ?? (collapseAt !== undefined && "mobile")}
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
          {t("showFullFile")}
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

function Tool({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
