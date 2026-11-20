"use client"

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@sniptide/ui/components/dialog"
import { Input } from "@sniptide/ui/components/input"
import { Kbd } from "@sniptide/ui/components/kbd"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ArrowRightIcon,
  ChevronRightIcon,
  CircleXIcon,
  CornerDownLeftIcon,
  FileTextIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { CollectionIcon } from "@/components/collections/icon"
import { useCanHover, useIsDesktop } from "@/components/shell/use-media-query"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { useSiteHost } from "@/components/site-host"
import type { Collection } from "@/lib/collections/types"
import { timeAgo } from "@/lib/format"
import type { SidebarPaste } from "@/lib/pastes/types"
import type { Command } from "./commands"
import { highlight, matches, parseQuery } from "./search"
import { usePasteSearch } from "./use-paste-search"

type Entry =
  | { id: string; kind: "paste"; slug: string; title: string; updatedAt: number }
  | { id: string; kind: "collection"; collection: Collection }
  | { id: string; kind: "command"; command: Command }

interface Group {
  id: string
  title: string
  entries: Entry[]
}

const RECENT_SHOWN = 3
const PASTES_SHOWN = 5
const COLLECTIONS_SHOWN = 4
// The field's own label sits on the menu's first action, which starts a paste with that title.
const TITLE_MAX = 200
// Mobile lists a couple of collections on the empty screen, in place of the desktop's Go to.
const COLLECTIONS_EMPTY_SHOWN = 2

function hrefOf(entry: Entry) {
  switch (entry.kind) {
    case "paste":
      return `/pastes/${entry.slug}`
    case "collection":
      return `/collections/${entry.collection.slug}`
    case "command":
      return entry.command.href
  }
}

// The ⌘K menu. Desktop is a dialog under the header; below lg it is a full-screen sheet on the
// grouped canvas, with each group of results on its own panel. The field keeps focus the whole
// time and the list is driven by aria-activedescendant, so typing never leaves the input.
export function CommandMenuDialog({
  open,
  onOpenChange,
  recent,
  collections,
  commands,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recent: SidebarPaste[]
  collections: Collection[]
  commands: Command[]
}) {
  const t = useTranslations("Workspace")
  const router = useRouter()
  const host = useSiteHost()
  const desktop = useIsDesktop()
  const canHover = useCanHover()
  const listId = React.useId()
  const [value, setValue] = React.useState("")
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { scope, text } = parseQuery(value)
  const search = usePasteSearch(text, scope === "all")

  // Every opening starts from an empty field.
  React.useEffect(() => {
    if (open) {
      setValue("")
      setActive(0)
    }
  }, [open])

  const groups = React.useMemo(() => {
    const result: Group[] = []
    const add = (id: string, title: string, entries: Entry[]) => {
      if (entries.length > 0) result.push({ id, title, entries })
    }
    const pasteEntries = (pastes: { slug: string; title: string; updatedAt: number }[]): Entry[] =>
      pastes.map((paste) => ({ id: `paste:${paste.slug}`, kind: "paste", ...paste }))
    const collectionEntries = (items: Collection[]): Entry[] =>
      items.map((collection) => ({
        id: `collection:${collection.slug}`,
        kind: "collection",
        collection,
      }))
    const commandEntries = (group: Command["group"]): Entry[] =>
      commands
        .filter((command) => command.group === group && matches(command.label, text))
        // Toggle theme is a keyboard habit; the phone menu leaves it out, like the design.
        .filter((command) => desktop || command.id !== "toggle-theme")
        // The shortcuts list is no use without a keyboard.
        .filter((command) => canHover || command.id !== "show-shortcuts")
        .map((command) => ({ id: command.id, kind: "command", command }))

    if (scope === "commands") {
      add("go", t("go_to"), commandEntries("go"))
      add("actions", t("actions"), commandEntries("actions"))
    } else if (text === "") {
      add("recent", t("recent_pastes"), pasteEntries(recent.slice(0, RECENT_SHOWN)))
      if (desktop) add("go", t("go_to"), commandEntries("go"))
      else
        add(
          "collections",
          t("collections"),
          collectionEntries(collections.slice(0, COLLECTIONS_EMPTY_SHOWN)),
        )
      add("actions", t("actions"), commandEntries("actions"))
    } else {
      add("pastes", t("pastes"), pasteEntries(search.hits.slice(0, PASTES_SHOWN)))
      const found = collections.filter(
        (collection) => matches(collection.name, text) || matches(collection.slug, text),
      )
      add("collections", t("collections"), collectionEntries(found.slice(0, COLLECTIONS_SHOWN)))
      // With text in the field, the actions offer to start a paste under that title, followed by
      // the commands whose names match.
      add("actions", t("actions"), [
        {
          id: "new-titled",
          kind: "command",
          command: {
            id: "new-titled",
            group: "actions",
            label: t("new_paste_titled", { title: text.slice(0, TITLE_MAX) }),
            icon: PlusIcon,
            href: `/new?${new URLSearchParams({ title: text.slice(0, TITLE_MAX) })}`,
          },
        },
        ...commandEntries("actions"),
      ])
    }
    return result
  }, [scope, text, recent, collections, commands, desktop, canHover, search.hits, t])

  const entries = React.useMemo(() => groups.flatMap((group) => group.entries), [groups])
  const activeIndex = Math.min(active, entries.length - 1)
  const activeEntry = entries[activeIndex]
  const optionId = (entry: Entry) => `${listId}-${entry.id}`

  React.useEffect(() => {
    if (!activeEntry) return
    document.getElementById(`${listId}-${activeEntry.id}`)?.scrollIntoView({ block: "nearest" })
  }, [activeEntry, listId])

  function choose(entry: Entry, newTab: boolean) {
    const href = hrefOf(entry)
    onOpenChange(false)
    if (!href) {
      if (entry.kind === "command") entry.command.run?.()
    } else if (newTab) {
      window.open(href, "_blank", "noopener")
    } else {
      router.push(href)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (entries.length === 0) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((activeIndex + step + entries.length) % entries.length)
    } else if (event.key === "Enter" && activeEntry && !event.nativeEvent.isComposing) {
      event.preventDefault()
      choose(activeEntry, event.metaKey || event.ctrlKey)
    }
  }

  const empty = entries.length === 0 && !search.pending
  // Earlier results stay on screen while a new search runs, so this only shows when there are none.
  const searching = entries.length === 0 && search.pending
  const seeAll = text !== "" && scope === "all" && search.total > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0",
          "lg:top-28 lg:w-160 lg:max-w-160 lg:translate-y-0",
          // A full-screen sheet on the grouped canvas below lg.
          "max-lg:inset-0 max-lg:h-dvh max-lg:bg-grouped max-lg:w-full max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:border-0 max-lg:shadow-none",
        )}
      >
        <DialogTitle className="sr-only">{t("command_menu")}</DialogTitle>

        <div className="flex items-center gap-3 border-border max-lg:pt-[calc(env(safe-area-inset-top)+0.75rem)] max-lg:pr-4 max-lg:pb-3 max-lg:pl-4 lg:h-14 lg:border-b lg:px-4">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-muted-foreground lg:left-0 lg:size-4"
            />
            <Input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeEntry ? optionId(activeEntry) : undefined}
              aria-autocomplete="list"
              aria-label={t("search_pastes_collections_or_run_a_command")}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder={
                desktop ? t("command_search_placeholder") : t("search_pastes_and_collections")
              }
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              className="pl-9 focus-visible:pl-[35px] max-lg:h-10 max-lg:border-0 max-lg:bg-foreground/[0.06] max-lg:pr-10 max-lg:pl-10 max-lg:text-[17px] max-lg:focus-visible:border-0 max-lg:focus-visible:pl-10 dark:max-lg:bg-muted lg:h-14 lg:border-0 lg:bg-transparent lg:pr-0 lg:pl-8 lg:text-[15px] lg:focus-visible:border-0 lg:focus-visible:pl-8"
            />
            {value ? (
              <button
                type="button"
                aria-label={t("clear_search")}
                onClick={() => {
                  setValue("")
                  setActive(0)
                  inputRef.current?.focus()
                }}
                className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:hidden"
              >
                <CircleXIcon
                  aria-hidden
                  className="size-[18px] fill-muted-foreground/70 stroke-card"
                />
              </button>
            ) : null}
          </div>
          <ShortcutKeys id="menu-close" className="max-lg:hidden" />
          <DialogClose className="shrink-0 text-[17px] text-link outline-none focus-visible:underline lg:hidden">
            {t("cancel")}
          </DialogClose>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label={t("results")}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 max-lg:flex max-lg:flex-col max-lg:gap-7 max-lg:px-4 max-lg:pt-2 max-lg:pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-h-[min(480px,calc(100dvh-14rem))] lg:flex-none lg:px-2 lg:pt-1.5 lg:pb-2"
        >
          {groups.map((group) => (
            // biome-ignore lint/a11y/useSemanticElements: a group inside a listbox is the ARIA pattern; <fieldset> is for form controls.
            <div key={group.id} role="group" aria-labelledby={`${listId}-${group.id}`}>
              <div
                id={`${listId}-${group.id}`}
                className="flex h-8 items-center px-4 text-[13px] text-muted-foreground max-lg:h-auto max-lg:pb-1.5 max-lg:leading-4 lg:h-7 lg:px-2.5 lg:text-xs"
              >
                {group.title}
              </div>
              <div className="max-lg:overflow-hidden max-lg:rounded-lg max-lg:bg-card">
                {group.entries.map((entry) => (
                  <Option
                    key={entry.id}
                    id={optionId(entry)}
                    active={entry === activeEntry}
                    onActivate={() => setActive(entries.indexOf(entry))}
                    onChoose={(newTab) => choose(entry, newTab)}
                  >
                    <EntryRow
                      entry={entry}
                      text={text}
                      host={host}
                      active={entry === activeEntry}
                      desktop={desktop}
                    />
                  </Option>
                ))}
              </div>
            </div>
          ))}
          {searching ? (
            <p role="status" className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("searching")}
            </p>
          ) : null}
          {empty ? (
            <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
              <p className="text-sm text-foreground">
                {text ? t("no_results_for", { text }) : t("nothing_here_yet")}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {scope === "commands"
                  ? t("try_another_command")
                  : t("search_covers_paste_titles_slugs_and_collection_names")}
              </p>
            </div>
          ) : null}
        </div>

        {seeAll ? (
          <div className="hidden h-10 shrink-0 items-center gap-4 border-t border-border bg-sidebar px-4 text-xs text-muted-foreground lg:flex">
            <Link
              href={`/pastes?q=${encodeURIComponent(text)}`}
              onClick={() => onOpenChange(false)}
              className="ml-auto flex items-center gap-1 font-medium text-link outline-none hover:underline focus-visible:underline"
            >
              {t("see_all_pastes", { count: search.total })}
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// One selectable row. Focus stays in the field, so the row is a listbox option rather than a
// button: Enter on the field and a click here both end up in `choose`.
function Option({
  id,
  active,
  onActivate,
  onChoose,
  children,
}: {
  id: string
  active: boolean
  onActivate: () => void
  onChoose: (newTab: boolean) => void
  children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard use goes through the combobox field, which owns focus.
    <div
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={active}
      data-active={active}
      onPointerMove={() => {
        if (!active) onActivate()
      }}
      onClick={(event) => onChoose(event.metaKey || event.ctrlKey)}
      className="relative flex cursor-default items-center gap-2.5 px-4 text-sm max-lg:min-h-[50px] max-lg:gap-3 max-lg:text-[17px] max-lg:leading-[22px] max-lg:active:bg-muted max-lg:not-last:after:absolute max-lg:not-last:after:right-0 max-lg:not-last:after:bottom-0 max-lg:not-last:after:left-[50px] max-lg:not-last:after:h-px max-lg:not-last:after:bg-border lg:h-9 lg:px-2.5 lg:data-[active=true]:bg-[#efefef] lg:data-[active=true]:before:absolute lg:data-[active=true]:before:inset-y-0 lg:data-[active=true]:before:left-0 lg:data-[active=true]:before:w-0.5 lg:data-[active=true]:before:bg-link dark:lg:data-[active=true]:bg-muted"
    >
      {children}
    </div>
  )
}

function Highlight({ value, text }: { value: string; text: string }) {
  return highlight(value, text).map((segment, index) =>
    segment.match ? (
      // Phones set the match in bold, which reads on the small rows without a fill.
      <mark
        key={index}
        className="bg-pink text-pink-foreground max-lg:bg-transparent max-lg:font-semibold max-lg:text-foreground"
      >
        {segment.text}
      </mark>
    ) : (
      <React.Fragment key={index}>{segment.text}</React.Fragment>
    ),
  )
}

function EntryRow({
  entry,
  text,
  host,
  active,
  desktop,
}: {
  entry: Entry
  text: string
  host: string
  active: boolean
  desktop: boolean
}) {
  const locale = useLocale()
  const t = useTranslations("Workspace")
  if (entry.kind === "paste") {
    const ago = timeAgo(entry.updatedAt, undefined, locale)
    return (
      <>
        <FileTextIcon
          aria-hidden="true"
          className="size-[22px] shrink-0 text-link lg:hidden"
          strokeWidth={1.75}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 max-lg:justify-center max-lg:py-2.5 lg:flex-row lg:items-baseline lg:gap-2.5">
          <span className="truncate text-foreground lg:shrink-0 lg:max-w-[55%]">
            <Highlight value={entry.title} text={text} />
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground max-lg:text-[13px] max-lg:leading-4">
            {/* The host is the same on every row, so phones keep the room for the slug and age. */}
            <span className="max-lg:hidden">{host}/</span>
            <Highlight value={entry.slug} text={text} />
            <span className="lg:hidden"> · {ago}</span>
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground max-lg:hidden">
          {active ? (
            <>
              {t("open")}
              <Kbd className="border border-border bg-background">
                <CornerDownLeftIcon className="size-3" />
              </Kbd>
            </>
          ) : (
            ago
          )}
        </span>
      </>
    )
  }

  if (entry.kind === "collection") {
    const { collection } = entry
    return (
      <>
        <span className="flex size-4 shrink-0 items-center justify-center max-lg:size-[22px]">
          <CollectionIcon
            icon={collection.icon}
            hue={collection.hue}
            className="size-2.5 max-lg:size-4"
          />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <Highlight value={collection.name} text={text} />
        </span>
        <span className="shrink-0 text-[13px] text-muted-foreground max-lg:hidden">
          {active && desktop ? (
            <span className="flex items-center gap-2">
              {t("open")}
              <Kbd className="border border-border bg-background">
                <CornerDownLeftIcon className="size-3" />
              </Kbd>
            </span>
          ) : (
            t("paste_count", { count: collection.pasteCount })
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-muted-foreground tabular-nums lg:hidden">
          <span className="sr-only">{t("paste_count", { count: collection.pasteCount })}</span>
          <span aria-hidden>{collection.pasteCount}</span>
          <ChevronRightIcon
            aria-hidden
            className="-mr-1 size-5 text-muted-foreground/60"
            strokeWidth={2}
          />
        </span>
      </>
    )
  }

  const { command } = entry
  const Icon = command.icon
  return (
    <>
      <Icon
        aria-hidden="true"
        className="size-4 shrink-0 text-foreground/75 max-lg:size-[22px] max-lg:text-link"
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1 truncate">
        <Highlight value={command.label} text={text} />
      </span>
      {command.shortcut ? (
        <span className="flex shrink-0 gap-1 max-lg:hidden">
          <ShortcutKeys id={command.shortcut} className="border border-border" />
        </span>
      ) : null}
    </>
  )
}
