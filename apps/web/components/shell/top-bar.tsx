"use client"

import { Button } from "@sniptide/ui/components/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChevronRightIcon,
  EyeIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { NewCollectionButton } from "@/components/collections/new-collection"
import { useCommandMenu } from "@/components/command-menu/command-menu"
import { ImportGistButton } from "@/components/lists/import-gist"
import { ViewToggle } from "@/components/lists/toolbar"
import { NavigationLink as Link } from "@/components/navigation-link"
import { ShortcutKeys, useShortcutLabel } from "@/components/shortcuts/shortcut-keys"
import { formatNumber } from "@/lib/format"
import { isPasteScreen, pageTitle } from "./nav-config"
import { NotificationsMenu } from "./notifications-menu"
import { useHeaderSlotRefs, useListView } from "./page-header"

const iconButtonClass =
  "rounded-lg inline-flex size-9 shrink-0 items-center justify-center text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4"

// Desktop top bar (lg and up): the page title on the left, the page's own actions on the right,
// with notifications at the far right, separated from page actions. The sidebar
// toggle lives next to the logo, and moves in here only while the sidebar is hidden.
// Below lg the shell shows MobileTopBar instead.
export function TopBar({
  onToggleSidebar,
  sidebarOpen,
  counts,
}: {
  onToggleSidebar: () => void
  sidebarOpen: boolean
  counts: Record<string, number>
}) {
  const t = useTranslations("Workspace")
  const secretsT = useTranslations("Secrets")
  const locale = useLocale()
  const currentPath = usePathname()
  const pathname = currentPath.startsWith("/dev/ui-stress/")
    ? `/${currentPath.split("/").at(-1)}`
    : currentPath
  const { setTitle, setActions } = useHeaderSlotRefs()
  const pasteScreen = isPasteScreen(pathname)
  const { view, setView } = useListView()
  const pasteList = pathname === "/pastes" || pathname === "/starred"
  const collection = /^\/collections\/[^/]+$/.test(pathname)
  const shared = pathname === "/shared"
  const count = counts[pathname]

  return (
    <header className="group/header sticky top-0 z-30 hidden min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-6 py-2 lg:flex">
      {sidebarOpen ? null : (
        <>
          <SidebarToggle onToggle={onToggleSidebar} open={false} className="-ml-2" />
          <span aria-hidden="true" className="h-5 w-px bg-border" />
        </>
      )}

      {/* Every page sits under "Workspace >", with the page's own title (or the one it sets)
          after the chevron. A paste names itself and leads with its own title. */}
      {pasteScreen ? null : (
        <nav aria-label={t("breadcrumb")} className="flex shrink-0 items-center gap-1.5 text-sm">
          <Link
            href="/dashboard"
            className="rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {t("workspace")}
          </Link>
          <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </nav>
      )}
      <div
        ref={setTitle}
        aria-current="page"
        className={cn(
          "group/title flex min-w-0 flex-1 items-center text-sm font-medium",
          !pasteScreen && "-ml-1.5",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5 group-has-data-header-title/title:hidden">
          <span className="truncate">{pageTitle(pathname) ? t(pageTitle(pathname)) : ""}</span>
          {count !== undefined && (
            <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px text-xs font-normal text-muted-foreground tabular-nums">
              {formatNumber(count, locale)}
            </span>
          )}
        </div>
      </div>

      {sidebarOpen ? null : <SearchField />}
      <div
        ref={setActions}
        data-header-actions=""
        className="group/actions flex max-w-full shrink-0 flex-wrap items-center gap-2 empty:hidden"
      >
        {(pasteList || shared || collection) && <ViewToggle value={view} onChange={setView} />}
        {pasteList && <ImportGistButton />}
        {pathname === "/collections" && (
          <NewCollectionButton existing={counts["/collections"] ?? 0} />
        )}
        {pathname === "/secrets" && (
          <Button size="lg" render={<Link href="/secrets/new" />} nativeButton={false}>
            <PlusIcon />
            {secretsT("new_group")}
          </Button>
        )}
        {(collection || pathname === "/new" || pathname.endsWith("/edit")) && (
          <div
            data-header-actions-fallback=""
            className="contents group-has-data-header-actions-content/actions:hidden"
          >
            {collection && (
              <Button
                variant="ghost"
                size="icon"
                disabled
                className="disabled:opacity-100"
                aria-label={t("actions")}
              >
                <MoreHorizontalIcon />
              </Button>
            )}
            {pathname === "/new" || pathname.endsWith("/edit") ? (
              <EditorActionsFallback editing={pathname.endsWith("/edit")} />
            ) : null}
          </div>
        )}
      </div>
      <span
        aria-hidden="true"
        className="hidden h-5 w-px bg-border group-has-[[data-header-actions]:not(:empty)]/header:block"
      />
      <NotificationsMenu className={`${iconButtonClass} border border-border`} />
    </header>
  )
}

function EditorActionsFallback({ editing }: { editing: boolean }) {
  const t = useTranslations("Paste")
  return (
    <>
      {!editing && (
        <Button variant="destructive" size="lg" disabled className="disabled:opacity-100">
          {t("discard")}
        </Button>
      )}
      <Button variant="outline" size="lg" disabled className="disabled:opacity-100">
        <EyeIcon />
        {t("preview")}
      </Button>
      <Button size="lg" disabled className="gap-2 disabled:opacity-100">
        {t(editing ? "done" : "createPaste")}
        <ShortcutKeys id="submit" className="bg-primary-foreground/20 text-primary-foreground" />
      </Button>
    </>
  )
}

// The sidebar's Search button is the usual way in; with the sidebar hidden this field stands in.
function SearchField() {
  const t = useTranslations("Workspace")
  const { open } = useCommandMenu()
  return (
    <button
      type="button"
      onClick={open}
      className="rounded-lg flex h-9 w-72 shrink-0 items-center gap-2 border border-border bg-background pr-2 pl-2.5 text-[13px] text-muted-foreground outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <SearchIcon className="size-3.5" />
      {t("search_pastes_collections")}
      <ShortcutKeys id="command-menu" className="ml-auto border border-border" />
    </button>
  )
}

export function SidebarToggle({
  onToggle,
  open,
  className,
}: {
  onToggle: () => void
  open: boolean
  className?: string
}) {
  const t = useTranslations("Workspace")
  const label = useShortcutLabel("toggle-sidebar")
  return (
    <Tooltip>
      <TooltipTrigger
        className={`${iconButtonClass} text-foreground/75 hover:text-foreground ${className ?? ""}`}
        onClick={onToggle}
        aria-label={open ? t("hide_sidebar") : t("show_sidebar")}
        aria-expanded={open}
      >
        <PanelLeftIcon />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
