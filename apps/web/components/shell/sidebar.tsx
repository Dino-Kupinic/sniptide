"use client"

import { arrayMove } from "@dnd-kit/helpers"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChartColumnIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  GripVerticalIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { CollectionMenu } from "@/components/collections/collection-menu"
import { CollectionIconPicker } from "@/components/collections/icon-picker"
import { NewCollectionDialog } from "@/components/collections/new-collection"
import { useCommandMenu } from "@/components/command-menu/command-menu"
import { ImportGistSheet } from "@/components/lists/import-gist"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import type { Collection } from "@/lib/collections/types"
import { setStarred } from "@/lib/pastes/actions"
import type { SidebarData, SidebarPaste } from "@/lib/pastes/types"
import type { ViewerSummary } from "@/lib/viewer"
import { AccountMenuItems } from "./account-menu"
import { isActivePath } from "./nav-config"
import { PasteMenu } from "./paste-menu"
import { completeSidebarOrder, type SectionId } from "./sidebar-state"
import { SidebarToggle } from "./top-bar"

export interface SidebarProps {
  viewer: ViewerSummary
  data: SidebarData
  collections: Collection[]
}

const rowClass =
  "group/row relative flex h-8 shrink-0 items-center gap-0.5 pr-1 pl-2 text-sm text-foreground/80 hover:bg-muted has-data-popup-open:bg-muted data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground"

// Reveal row/header controls on hover or focus; touch-only devices always need them visible.
const revealClass =
  "opacity-0 [@media(hover:none)]:opacity-100 group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100 group-has-data-popup-open/row:opacity-100"

const iconButtonClass =
  "relative z-10 flex size-6 shrink-0 items-center justify-center text-foreground/75 outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-foreground/10 [&_svg]:size-3.5"

export function Sidebar({
  viewer,
  data,
  collections,
  closed,
  sectionOrder,
  collectionOrder,
  onReorderSections,
  onReorderCollections,
  onToggleSection,
  onToggleSidebar,
}: SidebarProps & {
  closed: SectionId[]
  sectionOrder: SectionId[]
  collectionOrder: string[]
  onReorderSections: (order: SectionId[]) => void
  onReorderCollections: (order: string[]) => void
  onToggleSection: (section: SectionId) => void
  onToggleSidebar: () => void
}) {
  const t = useTranslations("Workspace")
  const pathname = usePathname()
  const { open: openCommandMenu } = useCommandMenu()
  const [creating, setCreating] = React.useState(false)
  const { counts } = data
  const visibleSections = sectionOrder.filter((id) => id !== "starred" || data.starred.length > 0)
  const orderedSlugs = completeSidebarOrder(
    collectionOrder,
    collections.map((item) => item.slug),
  )
  const collectionsBySlug = new Map(collections.map((item) => [item.slug, item]))

  return (
    <div className="flex h-full flex-col gap-3 px-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/dashboard"
          className="px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Logo />
        </Link>
        <SidebarToggle onToggle={onToggleSidebar} open />
      </div>

      <button
        type="button"
        onClick={openCommandMenu}
        className="flex h-8.5 shrink-0 items-center gap-2 border border-border bg-background pr-1.5 pl-2.5 text-[13px] text-muted-foreground outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <SearchIcon className="size-3.5" />
        {t("search")}
        <ShortcutKeys id="command-menu" className="ml-auto border border-border" />
      </button>

      <Button
        size="lg"
        className="h-9 shrink-0 justify-start gap-2 pr-1.5 pl-3"
        render={<Link href="/new" />}
        nativeButton={false}
      >
        <PlusIcon />
        {t("new_paste")}
        <ShortcutKeys id="new-paste" className="ml-auto border border-white/30" />
      </Button>

      <nav aria-label={t("main")} className="flex flex-col gap-0.5">
        <NavLink href="/dashboard" pathname={pathname}>
          <LayoutGridIcon />
          {t("dashboard")}
        </NavLink>
        <NavLink href="/analytics" pathname={pathname}>
          <ChartColumnIcon />
          {t("analytics")}
        </NavLink>
        <NavLink href="/secrets" pathname={pathname}>
          <KeyRoundIcon />
          {t("secrets")}
        </NavLink>
        <MoreMenu pathname={pathname} shared={counts.shared} />
      </nav>

      {/* Only the lists scroll, so the account menu stays pinned to the bottom however many
          items there are. The negative margin keeps focus rings at the edges from clipping. */}
      <div className="-mx-2 flex min-h-0 flex-1 scroll-fade scrollbar-subtle flex-col gap-3 overflow-y-auto px-2">
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled) return
            const { source } = event.operation
            if (!isSortable(source) || source.initialIndex === source.index) return
            if (source.type === "section") {
              const reordered = arrayMove(visibleSections, source.initialIndex, source.index)
              let index = 0
              // Invisible Starred keeps its place until there are stars to show again.
              onReorderSections(
                sectionOrder.map((id) =>
                  visibleSections.includes(id) ? (reordered[index++] ?? id) : id,
                ),
              )
            } else if (source.type === "collection") {
              onReorderCollections(arrayMove(orderedSlugs, source.initialIndex, source.index))
            }
          }}
        >
          {visibleSections.map((id, index) => {
            switch (id) {
              case "starred":
                return (
                  <Section
                    key={id}
                    id="starred"
                    index={index}
                    title={t("starred")}
                    open={!closed.includes("starred")}
                    onToggle={onToggleSection}
                  >
                    {data.starred.map((paste) => (
                      <PasteRow
                        key={paste.slug}
                        paste={paste}
                        collections={collections}
                        pathname={pathname}
                        alwaysShowStar
                      />
                    ))}
                    <ViewAll href="/starred" count={counts.starred} shown={data.starred.length} />
                  </Section>
                )
              case "pastes":
                return (
                  <Section
                    key={id}
                    id="pastes"
                    index={index}
                    title={t("pastes")}
                    open={!closed.includes("pastes")}
                    onToggle={onToggleSection}
                    add={
                      <Link href="/new" aria-label={t("new_paste")} className={iconButtonClass}>
                        <PlusIcon />
                      </Link>
                    }
                  >
                    {data.recent.map((paste) => (
                      <PasteRow
                        key={paste.slug}
                        paste={paste}
                        collections={collections}
                        pathname={pathname}
                      />
                    ))}
                    {data.recent.length === 0 ? (
                      <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
                        {t("no_pastes_yet")}
                      </p>
                    ) : null}
                    <ViewAll href="/pastes" count={counts.pastes} shown={data.recent.length} />
                  </Section>
                )
              case "collections":
                return (
                  <Section
                    key={id}
                    id="collections"
                    index={index}
                    title={t("collections")}
                    open={!closed.includes("collections")}
                    onToggle={onToggleSection}
                    add={
                      <button
                        type="button"
                        aria-label={t("new_collection")}
                        onClick={() => setCreating(true)}
                        className={iconButtonClass}
                      >
                        <PlusIcon />
                      </button>
                    }
                  >
                    {orderedSlugs.map((slug, index) => {
                      const collection = collectionsBySlug.get(slug)
                      return collection ? (
                        <CollectionRow
                          key={slug}
                          collection={collection}
                          index={index}
                          pathname={pathname}
                        />
                      ) : null
                    })}
                  </Section>
                )
            }
            return null
          })}
        </DragDropProvider>
      </div>
      <NewCollectionDialog
        existing={collections.length}
        open={creating}
        onOpenChange={setCreating}
      />

      {/* A hairline across the full sidebar width separates the account menu from the lists. */}
      <div className="-mx-2 shrink-0 border-t border-border px-2 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-9 w-full items-center gap-2 px-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted">
            <Avatar className="size-6 font-heading text-[11px] font-bold">
              {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{viewer.name}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="w-(--anchor-width) min-w-60">
            <AccountMenuItems name={viewer.name} email={viewer.email} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// A top-level page under the logo: icon and label, marked while on that page or below it.
function NavLink({
  href,
  pathname,
  children,
}: {
  href: string
  pathname: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      data-active={isActivePath(pathname, href)}
      className={cn(
        rowClass,
        "gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4",
      )}
    >
      {children}
    </Link>
  )
}

// "More" under Analytics: the pages that used to be top-level, in a dropdown.
function MoreMenu({ pathname, shared }: { pathname: string; shared: number }) {
  const t = useTranslations("Workspace")
  // The import sheet lives outside the menu, which unmounts its items when it closes.
  const [importing, setImporting] = React.useState(false)
  // On one of its pages, the row reads as that page instead of "More".
  const current = isActivePath(pathname, "/shared")
    ? t("shared_with_me")
    : isActivePath(pathname, "/trash")
      ? t("trash")
      : null
  const active = current !== null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-active={active}
          className={cn(
            rowClass,
            "group gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted [&_svg]:size-4",
          )}
        >
          <ChevronRightIcon className="transition-transform group-data-popup-open:rotate-90" />
          {current ?? t("more")}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-(--anchor-width)">
          <DropdownMenuItem
            render={<Link href="/shared" />}
            className={cn(isActivePath(pathname, "/shared") && "font-medium")}
          >
            <UsersIcon />
            {t("shared_with_me")}
            {shared > 0 ? (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{shared}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setImporting(true)}>
            <DownloadIcon />
            {t("import")}
          </DropdownMenuItem>
          {/* Trash stays last. */}
          <DropdownMenuItem
            render={<Link href="/trash" />}
            className={cn(isActivePath(pathname, "/trash") && "font-medium")}
          >
            <Trash2Icon />
            {t("trash")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportGistSheet open={importing} onOpenChange={setImporting} />
    </>
  )
}

// A sortable group with a separate drag handle so folding and menu actions remain clickable.
function Section({
  id,
  index,
  title,
  open,
  onToggle,
  add,
  children,
}: {
  id: SectionId
  index: number
  title: string
  open: boolean
  onToggle: (section: SectionId) => void
  add?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useTranslations("Workspace")
  const contentId = `sidebar-${id}`
  const { ref, handleRef, isDragSource } = useSortable({
    id: `section:${id}`,
    index,
    type: "section",
    accept: "section",
    group: "sections",
  })

  return (
    <section
      ref={ref}
      aria-label={title}
      className={cn(
        "flex shrink-0 flex-col gap-0.5",
        isDragSource && "relative z-20 bg-sidebar shadow-sm",
      )}
    >
      <div className="group/row flex h-7 shrink-0 items-center gap-0.5 pr-1 pl-2 text-muted-foreground hover:bg-muted hover:text-foreground has-data-popup-open:bg-muted">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onToggle(id)}
          className="flex min-w-0 flex-1 items-center gap-1 self-stretch text-left text-xs font-medium outline-none focus-visible:underline"
        >
          {title}
          {open ? (
            <ChevronDownIcon className="size-3 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-3 shrink-0" />
          )}
        </button>
        <DragHandle ref={handleRef} label={t("reorder_section", { name: title })} />
        <PlaceholderMenu
          label={t("filter_section", { name: title })}
          note={t("filters_are_coming_soon")}
          icon={<ListFilterIcon />}
        />
        <PlaceholderMenu
          label={t("section_options", { name: title })}
          note={t("more_options_are_coming_soon")}
          icon={<MoreHorizontalIcon />}
        />
        {add}
      </div>
      {open ? (
        <div id={contentId} className="flex flex-col gap-0.5">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function DragHandle({ ref, label }: { ref: React.Ref<HTMLButtonElement>; label: string }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(iconButtonClass, revealClass, "touch-none cursor-grab active:cursor-grabbing")}
    >
      <GripVerticalIcon />
    </button>
  )
}

function CollectionRow({
  collection,
  index,
  pathname,
}: {
  collection: Collection
  index: number
  pathname: string
}) {
  const t = useTranslations("Workspace")
  const { ref, handleRef, isDragSource } = useSortable({
    id: `collection:${collection.slug}`,
    index,
    type: "collection",
    accept: "collection",
    group: "collections",
  })
  const href = `/collections/${collection.slug}`
  return (
    <div
      ref={ref}
      data-active={isActivePath(pathname, href)}
      className={cn(rowClass, "gap-1.5 pl-1.5", isDragSource && "z-20 bg-sidebar shadow-sm")}
    >
      <CollectionIconPicker collection={collection} />
      <Link
        href={href}
        className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 focus-visible:underline"
      >
        {collection.name}
      </Link>
      <DragHandle ref={handleRef} label={t("reorder_collection", { name: collection.name })} />
      <CollectionMenu
        collection={collection}
        afterDelete={isActivePath(pathname, href) ? "/collections" : undefined}
        className={cn(iconButtonClass, revealClass)}
      />
    </div>
  )
}

function PlaceholderMenu({
  label,
  note,
  icon,
}: {
  label: string
  note: string
  icon: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={label} className={cn(iconButtonClass, revealClass)}>
        {icon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled>{note}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PasteRow({
  paste,
  collections,
  pathname,
  alwaysShowStar = false,
}: {
  paste: SidebarPaste
  collections: Collection[]
  pathname: string
  alwaysShowStar?: boolean
}) {
  const t = useTranslations("Workspace")
  const [starred, setStarredState] = React.useState(paste.starred)
  const [, startTransition] = React.useTransition()
  React.useEffect(() => setStarredState(paste.starred), [paste.starred])

  return (
    <div data-active={isActivePath(pathname, `/pastes/${paste.slug}`)} className={rowClass}>
      <Link
        href={`/pastes/${paste.slug}`}
        className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 focus-visible:underline"
      >
        {paste.title}
      </Link>
      <PasteMenu
        paste={{ ...paste, starred }}
        collections={collections}
        className={cn(iconButtonClass, revealClass)}
      />
      <button
        type="button"
        aria-label={
          starred
            ? t("unstar_named", { name: paste.title })
            : t("star_named", { name: paste.title })
        }
        aria-pressed={starred}
        onClick={() => {
          setStarredState(!starred)
          startTransition(() => setStarred(paste.slug, !starred))
        }}
        className={cn(iconButtonClass, !(alwaysShowStar && starred) && revealClass)}
      >
        <StarIcon className={cn(starred && "fill-link text-link")} />
      </button>
    </div>
  )
}

function ViewAll({ href, count, shown }: { href: string; count: number; shown: number }) {
  const t = useTranslations("Workspace")
  if (count <= shown) return null
  return (
    <Link
      href={href}
      className="flex h-7 shrink-0 items-center px-2 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
    >
      {t("view_all_count", { count })}
    </Link>
  )
}
