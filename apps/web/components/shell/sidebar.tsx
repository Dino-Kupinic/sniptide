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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { Logo } from "@sniptide/ui/components/logo"
import { Reveal } from "@sniptide/ui/components/reveal"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChartColumnIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  ChevronsUpDownIcon as ExpandIcon,
  FolderIcon,
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
  WorkflowIcon,
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
import {
  type CollectionSort,
  completeSidebarOrder,
  isFiltered,
  type PasteSectionView,
  type SectionId,
  SIDEBAR_LIMITS,
  SIDEBAR_SORTS,
  SIDEBAR_VISIBILITIES,
  type SidebarViews,
} from "./sidebar-state"
import { SidebarToggle } from "./top-bar"

export interface SidebarProps {
  viewer: ViewerSummary
  data: SidebarData
  collections: Collection[]
}

const rowClass =
  "group/row relative flex h-8 shrink-0 rounded-md items-center gap-0.5 pr-1 pl-2 text-sm text-foreground/80 hover:bg-muted has-data-popup-open:bg-muted data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground"

// Reveal row/header controls on hover or focus; touch-only devices always need them visible.
const revealClass =
  "opacity-0 [@media(hover:none)]:opacity-100 group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100 group-has-data-popup-open/row:opacity-100"

const iconButtonClass =
  "relative z-10 flex size-6 shrink-0 rounded-md items-center justify-center text-foreground/75 outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-foreground/10 [&_svg]:size-3.5"

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
  views,
  onChangeViews,
}: SidebarProps & {
  views: SidebarViews
  onChangeViews: (views: SidebarViews) => void
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
  // Starred shows while there are stars at all, so a filter that matches none can be cleared.
  const visibleSections = sectionOrder.filter((id) => id !== "starred" || counts.starred > 0)
  const byName = views.collections.sort === "name"
  const orderedSlugs = byName
    ? [...collections]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        .map((item) => item.slug)
    : completeSidebarOrder(
        collectionOrder,
        collections.map((item) => item.slug),
      )
  const setPasteView = (section: "pastes" | "starred", patch: Partial<PasteSectionView>) =>
    onChangeViews({ ...views, [section]: { ...views[section], ...patch } })
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

      {/* Search and New paste read as one group, so they sit closer than the other groups. */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={openCommandMenu}
          className="flex h-8.5 shrink-0 items-center gap-2 rounded-lg border border-border bg-background pr-1.5 pl-2.5 text-[13px] text-muted-foreground outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <SearchIcon className="size-3.5" />
          {t("search")}
          <ShortcutKeys id="command-menu" className="ml-auto border border-border" />
        </button>

        <Button
          size="lg"
          className="h-[34px] shrink-0 justify-start gap-2 pr-1.5 pl-3"
          render={<Link href="/new" />}
          nativeButton={false}
        >
          <PlusIcon />
          {t("new_paste")}
          <ShortcutKeys id="new-paste" className="ml-auto border border-white/30" />
        </Button>
      </div>

      <nav aria-label={t("main")} className="flex flex-col gap-0.5">
        <NavLink href="/dashboard" pathname={pathname}>
          <LayoutGridIcon />
          {t("dashboard")}
        </NavLink>
        <NavLink href="/analytics" pathname={pathname}>
          <ChartColumnIcon />
          {t("analytics")}
        </NavLink>
        <div className="flex h-8 shrink-0 items-center gap-2 pr-1 pl-2 text-sm text-muted-foreground [&_svg]:size-4">
          <WorkflowIcon className="shrink-0" />
          <span className="min-w-0 flex-1">{t("workflows")}</span>
          <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] leading-none font-normal text-muted-foreground">
            {t("coming_soon")}
          </span>
        </div>
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
                    filter={
                      <PasteFilterMenu
                        title={t("starred")}
                        view={views.starred}
                        onChange={(patch) => setPasteView("starred", patch)}
                      />
                    }
                    menu={
                      <SectionMenu
                        title={t("starred")}
                        open={!closed.includes("starred")}
                        onToggle={() => onToggleSection("starred")}
                        viewAll="/starred"
                        limit={views.starred.limit}
                        onLimit={(limit) => setPasteView("starred", { limit })}
                      />
                    }
                  >
                    {data.starred.length === 0 ? (
                      <FilteredEmpty
                        onClear={() =>
                          setPasteView("starred", { visibility: "all", sort: "updated" })
                        }
                      />
                    ) : null}
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
                    filter={
                      <PasteFilterMenu
                        title={t("pastes")}
                        view={views.pastes}
                        onChange={(patch) => setPasteView("pastes", patch)}
                      />
                    }
                    menu={
                      <SectionMenu
                        title={t("pastes")}
                        open={!closed.includes("pastes")}
                        onToggle={() => onToggleSection("pastes")}
                        viewAll={pasteListHref(views.pastes)}
                        limit={views.pastes.limit}
                        onLimit={(limit) => setPasteView("pastes", { limit })}
                        create={{ href: "/new", label: t("new_paste") }}
                      />
                    }
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
                      counts.pastes > 0 ? (
                        <FilteredEmpty
                          onClear={() =>
                            setPasteView("pastes", { visibility: "all", sort: "updated" })
                          }
                        />
                      ) : (
                        <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
                          {t("no_pastes_yet")}
                        </p>
                      )
                    ) : null}
                    <ViewAll
                      href={pasteListHref(views.pastes)}
                      count={counts.pastes}
                      shown={data.recent.length}
                    />
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
                    filter={
                      <CollectionFilterMenu
                        title={t("collections")}
                        sort={views.collections.sort}
                        onChange={(sort) => onChangeViews({ ...views, collections: { sort } })}
                      />
                    }
                    menu={
                      <SectionMenu
                        title={t("collections")}
                        open={!closed.includes("collections")}
                        onToggle={() => onToggleSection("collections")}
                        viewAll="/collections"
                        viewAllLabel={t("manage_collections")}
                        create={{ onSelect: () => setCreating(true), label: t("new_collection") }}
                      />
                    }
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
                          draggable={!byName}
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
          <DropdownMenuTrigger className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted">
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
  filter,
  menu,
  add,
  children,
}: {
  id: SectionId
  index: number
  title: string
  open: boolean
  onToggle: (section: SectionId) => void
  filter: React.ReactNode
  menu: React.ReactNode
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
        isDragSource && "rounded-md relative z-20 bg-sidebar shadow-sm",
      )}
    >
      <div className="group/row flex h-7 shrink-0 rounded-md items-center gap-0.5 pr-1 pl-2 text-muted-foreground hover:bg-muted hover:text-foreground has-data-popup-open:bg-muted">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onToggle(id)}
          className="flex min-w-0 flex-1 items-center gap-1 self-stretch text-left text-xs font-medium outline-none focus-visible:underline"
        >
          {title}
          <ChevronDownIcon
            className={cn(
              "size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
          />
        </button>
        <DragHandle ref={handleRef} label={t("reorder_section", { name: title })} />
        {filter}
        {menu}
        {add}
      </div>
      <Reveal open={open} id={contentId} className="flex flex-col gap-0.5">
        {children}
      </Reveal>
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
  draggable = true,
}: {
  collection: Collection
  index: number
  pathname: string
  // Sorted by name there is no order to drag.
  draggable?: boolean
}) {
  const t = useTranslations("Workspace")
  const { ref, handleRef, isDragSource } = useSortable({
    id: `collection:${collection.slug}`,
    index,
    type: "collection",
    accept: "collection",
    group: "collections",
    disabled: !draggable,
  })
  const href = `/collections/${collection.slug}`
  return (
    <div
      ref={ref}
      data-active={isActivePath(pathname, href)}
      className={cn(
        rowClass,
        "rounded-md gap-1.5 pl-1.5",
        isDragSource && "z-20 bg-sidebar shadow-sm",
      )}
    >
      <CollectionIconPicker collection={collection} />
      <Link
        href={href}
        className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 focus-visible:underline"
      >
        {collection.name}
      </Link>
      {draggable ? (
        <DragHandle ref={handleRef} label={t("reorder_collection", { name: collection.name })} />
      ) : null}
      <CollectionMenu
        collection={collection}
        afterDelete={isActivePath(pathname, href) ? "/collections" : undefined}
        className={cn(iconButtonClass, revealClass)}
      />
    </div>
  )
}

const visibilityLabels = {
  all: "all",
  public: "public",
  unlisted: "unlisted",
  private: "private",
} as const
const sortLabels = { updated: "last_updated", views: "most_viewed", title: "title_a_to_z" } as const

// The paste list with the same filter and sort, for "View all".
function pasteListHref(view: PasteSectionView) {
  const params = new URLSearchParams()
  if (view.visibility !== "all") params.set("visibility", view.visibility)
  if (view.sort !== "updated") params.set("sort", view.sort)
  const query = params.toString()
  return query ? `/pastes?${query}` : "/pastes"
}

// A section's filter button. It stays visible, in the link color, while a filter is on.
function FilterTrigger({ label, active }: { label: string; active: boolean }) {
  return (
    <DropdownMenuTrigger
      aria-label={label}
      className={cn(iconButtonClass, active ? "text-link hover:text-link" : revealClass)}
    >
      <ListFilterIcon />
    </DropdownMenuTrigger>
  )
}

function PasteFilterMenu({
  title,
  view,
  onChange,
}: {
  title: string
  view: PasteSectionView
  onChange: (patch: Partial<PasteSectionView>) => void
}) {
  const t = useTranslations("Workspace")
  return (
    <DropdownMenu>
      <FilterTrigger label={t("filter_section", { name: title })} active={isFiltered(view)} />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t("visibility")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={view.visibility}
          onValueChange={(visibility) =>
            onChange({ visibility: visibility as PasteSectionView["visibility"] })
          }
        >
          {SIDEBAR_VISIBILITIES.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(visibilityLabels[value])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("sort_by")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={view.sort}
          onValueChange={(sort) => onChange({ sort: sort as PasteSectionView["sort"] })}
        >
          {SIDEBAR_SORTS.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(sortLabels[value])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CollectionFilterMenu({
  title,
  sort,
  onChange,
}: {
  title: string
  sort: CollectionSort
  onChange: (sort: CollectionSort) => void
}) {
  const t = useTranslations("Workspace")
  return (
    <DropdownMenu>
      <FilterTrigger label={t("filter_section", { name: title })} active={sort !== "custom"} />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t("sort_by")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => onChange(value as CollectionSort)}
        >
          <DropdownMenuRadioItem value="custom">{t("your_order")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="name">{t("name_a_to_z")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A section's ⋯ menu: how many items it lists, folding it, its full page and a way to add one.
function SectionMenu({
  title,
  open,
  onToggle,
  viewAll,
  viewAllLabel,
  limit,
  onLimit,
  create,
}: {
  title: string
  open: boolean
  onToggle: () => void
  viewAll: string
  viewAllLabel?: string
  limit?: number
  onLimit?: (limit: number) => void
  create?: { label: string; href?: string; onSelect?: () => void }
}) {
  const t = useTranslations("Workspace")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("section_options", { name: title })}
        className={cn(iconButtonClass, revealClass)}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {limit !== undefined && onLimit ? (
          <>
            <DropdownMenuLabel>{t("items_shown")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(limit)}
              onValueChange={(value) => onLimit(Number(value))}
            >
              {SIDEBAR_LIMITS.map((value) => (
                <DropdownMenuRadioItem key={value} value={String(value)}>
                  {t("items_count", { count: value })}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {create ? (
          <DropdownMenuItem
            render={create.href ? <Link href={create.href} /> : undefined}
            onClick={create.onSelect}
          >
            <PlusIcon />
            {create.label}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href={viewAll} />}>
          <FolderIcon />
          {viewAllLabel ?? t("view_all")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggle}>
          {open ? <ChevronsDownUpIcon /> : <ExpandIcon />}
          {open ? t("collapse_section") : t("expand_section")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A filter that matches nothing says so, with a way back to the full list.
function FilteredEmpty({ onClear }: { onClear: () => void }) {
  const t = useTranslations("Workspace")
  return (
    <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
      {t("no_matching_pastes")}{" "}
      <button
        type="button"
        onClick={onClear}
        className="font-medium text-link outline-none hover:underline focus-visible:underline"
      >
        {t("clear_filter")}
      </button>
    </p>
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
