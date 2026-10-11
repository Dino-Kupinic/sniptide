"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@sniptide/ui/components/avatar"
import { Button } from "@sniptide/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sniptide/ui/components/dropdown-menu"
import { Kbd } from "@sniptide/ui/components/kbd"
import { Logo } from "@sniptide/ui/components/logo"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
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
import * as React from "react"
import { CollectionIconPicker } from "@/components/collections/icon-picker"
import { NewCollectionDialog } from "@/components/collections/new-collection"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import { setStarred } from "@/lib/pastes/actions"
import type { SidebarData, SidebarPaste } from "@/lib/pastes/types"
import type { ViewerSummary } from "@/lib/viewer"
import { AccountMenuItems } from "./account-menu"
import { isActivePath } from "./nav-config"
import { PasteMenu } from "./paste-menu"
import type { SectionId } from "./sidebar-state"
import { SidebarToggle } from "./top-bar"

export interface SidebarProps {
  viewer: ViewerSummary
  data: SidebarData
  collections: Collection[]
}

const rowClass =
  "group/row relative flex h-8 shrink-0 items-center gap-0.5 pr-1 pl-2 text-sm text-foreground/80 hover:bg-muted has-data-popup-open:bg-muted data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground"

// Buttons on a row or header that only show while it is hovered (or one of them is in use).
const revealClass =
  "opacity-0 group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100 group-has-data-popup-open/row:opacity-100"

const iconButtonClass =
  "relative z-10 flex size-6 shrink-0 items-center justify-center text-foreground/75 outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-foreground/10 [&_svg]:size-3.5"

export function Sidebar({
  viewer,
  data,
  collections,
  closed,
  onToggleSection,
  onToggleSidebar,
}: SidebarProps & {
  closed: SectionId[]
  onToggleSection: (section: SectionId) => void
  onToggleSidebar: () => void
}) {
  const pathname = usePathname()
  const [creating, setCreating] = React.useState(false)
  const { counts } = data

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

      {/* Search isn't built yet; the field holds its place in the layout. */}
      <button
        type="button"
        className="flex h-8.5 shrink-0 items-center gap-2 border border-border bg-background pr-1.5 pl-2.5 text-[13px] text-muted-foreground outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <SearchIcon className="size-3.5" />
        Search
        <Kbd className="ml-auto border border-border">⌘K</Kbd>
      </button>

      <Button
        size="lg"
        className="h-9 shrink-0 justify-start gap-2 pr-1.5 pl-3"
        render={<Link href="/new" />}
        nativeButton={false}
      >
        <PlusIcon />
        New paste
        <Kbd className="ml-auto border border-white/30">⌘N</Kbd>
      </Button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <Link
          href="/dashboard"
          data-active={isActivePath(pathname, "/dashboard")}
          className={cn(
            rowClass,
            "gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4",
          )}
        >
          <LayoutGridIcon />
          Dashboard
        </Link>
        <MoreMenu pathname={pathname} shared={counts.shared} />
      </nav>

      {/* Only the lists scroll, so the account menu stays pinned to the bottom however many
          items there are. The negative margin keeps focus rings at the edges from clipping. */}
      <div className="-mx-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2">
        {data.starred.length > 0 ? (
          <Section
            id="starred"
            title="Starred"
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
        ) : null}

        <Section
          id="pastes"
          title="Pastes"
          open={!closed.includes("pastes")}
          onToggle={onToggleSection}
          add={
            <Link href="/new" aria-label="New paste" className={iconButtonClass}>
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
            <p className="px-2 py-1.5 text-[13px] text-muted-foreground">No pastes yet.</p>
          ) : null}
          <ViewAll href="/pastes" count={counts.pastes} shown={data.recent.length} />
        </Section>

        <Section
          id="collections"
          title="Collections"
          open={!closed.includes("collections")}
          onToggle={onToggleSection}
          add={
            <button
              type="button"
              aria-label="New collection"
              onClick={() => setCreating(true)}
              className={iconButtonClass}
            >
              <PlusIcon />
            </button>
          }
        >
          {collections.map((collection) => (
            <div
              key={collection.slug}
              data-active={isActivePath(pathname, `/collections/${collection.slug}`)}
              className={cn(rowClass, "gap-1.5 pl-1.5")}
            >
              <CollectionIconPicker collection={collection} />
              <Link
                href={`/collections/${collection.slug}`}
                className="min-w-0 flex-1 truncate outline-none after:absolute after:inset-0 focus-visible:underline"
              >
                {collection.name}
              </Link>
            </div>
          ))}
        </Section>
      </div>
      <NewCollectionDialog
        existing={collections.length}
        open={creating}
        onOpenChange={setCreating}
      />

      <DropdownMenu>
        <DropdownMenuTrigger className="flex shrink-0 items-center gap-2.5 p-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted">
          <Avatar>
            {viewer.image ? <AvatarImage src={viewer.image} alt="" /> : null}
            <AvatarFallback>{viewer.initials}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{viewer.name}</span>
            <span className="truncate text-xs text-muted-foreground">{viewer.email}</span>
          </span>
          <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" className="w-(--anchor-width)">
          <AccountMenuItems email={viewer.email} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// "More" under Dashboard: the pages that used to be top-level, in a dropdown.
function MoreMenu({ pathname, shared }: { pathname: string; shared: number }) {
  // On one of its pages, the row reads as that page instead of "More".
  const current = isActivePath(pathname, "/shared")
    ? "Shared with me"
    : isActivePath(pathname, "/trash")
      ? "Trash"
      : null
  const active = current !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-active={active}
        className={cn(
          rowClass,
          "group gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted [&_svg]:size-4",
        )}
      >
        <ChevronRightIcon className="transition-transform group-data-popup-open:rotate-90" />
        {current ?? "More"}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--anchor-width)">
        <DropdownMenuItem
          render={<Link href="/shared" />}
          className={cn(isActivePath(pathname, "/shared") && "font-medium")}
        >
          <UsersIcon />
          Shared with me
          {shared > 0 ? (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{shared}</span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href="/trash" />}
          className={cn(isActivePath(pathname, "/trash") && "font-medium")}
        >
          <Trash2Icon />
          Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A titled group that folds shut from its header. The header's filter and ⋯ show on hover and
// are placeholders for now; `add` (the +) stays visible.
function Section({
  id,
  title,
  open,
  onToggle,
  add,
  children,
}: {
  id: SectionId
  title: string
  open: boolean
  onToggle: (section: SectionId) => void
  add?: React.ReactNode
  children: React.ReactNode
}) {
  const contentId = `sidebar-${id}`

  return (
    <section aria-label={title} className="flex flex-col gap-0.5">
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
        <PlaceholderMenu
          label={`Filter ${title.toLowerCase()}`}
          note="Filters are coming soon."
          icon={<ListFilterIcon />}
        />
        <PlaceholderMenu
          label={`${title} options`}
          note="More options are coming soon."
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
        aria-label={starred ? `Unstar ${paste.title}` : `Star ${paste.title}`}
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
  if (count <= shown) return null
  return (
    <Link
      href={href}
      className="flex h-7 shrink-0 items-center px-2 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
    >
      View all {formatNumber(count)}
    </Link>
  )
}
