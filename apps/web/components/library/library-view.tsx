"use client"

import { Button } from "@sniptide/ui/components/button"
import { Skeleton } from "@sniptide/ui/components/skeleton"
import {
  ChartColumnIcon,
  DownloadIcon,
  KeyRoundIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import * as React from "react"
import { CollectionIcon } from "@/components/collections/icon"
import { NewCollectionDialog } from "@/components/collections/new-collection"
import {
  GroupedCanvas,
  GroupedLinkRow,
  GroupedList,
  GroupedRowBody,
  GroupedRowIcon,
  groupedRowBodyClass,
  groupedRowClass,
} from "@/components/lists/grouped-list"
import { ImportGistSheet } from "@/components/lists/import-gist"
import { ListHeader } from "@/components/lists/toolbar"
import { UserAvatar } from "@/components/people/user-avatar"
import { useViewer } from "@/components/shell/app-shell"
import { useIsDesktop } from "@/components/shell/use-media-query"
import { useSiteOrigin } from "@/components/site-host"
import { signOut as signOutAccount } from "@/lib/auth-client"
import type { Collection } from "@/lib/collections/types"
import { formatNumber } from "@/lib/format"
import { profilePath } from "@/lib/profile-path"

export interface LibraryCounts {
  starred: number
  shared: number
  trash: number
}

// Everything beyond Home and Pastes on a phone, as the Library tab: the viewer's other lists,
// their collections, then the tools and the account. Desktop reaches the same pages from the
// sidebar, and this page lists them there too.
export function LibraryView({
  counts,
  collections,
}: {
  // Null while the route loads: the rows that need no data render, and the rest hold their place.
  counts: LibraryCounts | null
  collections: Collection[] | null
}) {
  const t = useTranslations("Workspace")
  const locale = useLocale()
  const router = useRouter()
  const origin = useSiteOrigin()
  const viewer = useViewer()
  const desktop = useIsDesktop()
  const [creating, setCreating] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const count = (value: number | undefined) => (value ? formatNumber(value, locale) : undefined)

  async function signOut() {
    await signOutAccount()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-7">
      <GroupedCanvas />
      <ListHeader title={t("library")} />
      <div className="flex w-full max-w-[560px] flex-col gap-7">
        <GroupedList>
          <GroupedLinkRow
            href="/starred"
            label={t("starred")}
            icon={StarIcon}
            value={count(counts?.starred)}
          />
          <GroupedLinkRow
            href="/shared"
            label={t("shared_with_me")}
            icon={UsersIcon}
            value={count(counts?.shared)}
          />
          <GroupedLinkRow href="/secrets" label={t("secrets")} icon={KeyRoundIcon} />
          <GroupedLinkRow
            href="/trash"
            label={t("trash")}
            icon={Trash2Icon}
            value={count(counts?.trash)}
          />
        </GroupedList>

        <GroupedList
          label={t("collections")}
          action={
            <Button
              variant="link"
              size="sm"
              className="-mr-3 h-6 text-[13px] font-normal"
              onClick={() => setCreating(true)}
            >
              {t("new")}
            </Button>
          }
        >
          {collections === null ? (
            Array.from({ length: 3 }, (_, index) => (
              <li
                key={index}
                aria-hidden
                className="group/item flex min-h-[50px] items-center gap-3 pl-4"
              >
                <Skeleton className="size-4" />
                <span className={groupedRowBodyClass}>
                  <Skeleton className="h-3.5 w-32" />
                </span>
              </li>
            ))
          ) : collections.length > 0 ? (
            collections.map((collection) => (
              <li key={collection.slug} className="group/item">
                <Link href={`/collections/${collection.slug}`} className={groupedRowClass}>
                  <span className="flex size-[22px] shrink-0 items-center justify-center">
                    <CollectionIcon icon={collection.icon} hue={collection.hue} />
                  </span>
                  <GroupedRowBody label={collection.name} value={count(collection.pasteCount)} />
                </Link>
              </li>
            ))
          ) : (
            <li className="flex min-h-[50px] items-center px-4 text-[17px] text-muted-foreground">
              {t("no_collections_yet")}
            </li>
          )}
        </GroupedList>

        <GroupedList>
          <GroupedLinkRow href="/analytics" label={t("analytics")} icon={ChartColumnIcon} />
          <li className="group/item">
            <button type="button" className={groupedRowClass} onClick={() => setImporting(true)}>
              <GroupedRowIcon icon={DownloadIcon} />
              <GroupedRowBody label={t("import_gist")} chevron={false} />
            </button>
          </li>
          {viewer.username ? (
            <GroupedLinkRow
              href={`${origin}${profilePath(viewer.username)}`}
              label={t("your_profile")}
              icon={UserIcon}
              external
            />
          ) : null}
          <GroupedLinkRow href="/settings" label={t("settings")} icon={SettingsIcon} />
        </GroupedList>

        <GroupedList>
          <li className="flex min-h-16 items-center gap-3 px-4 py-3">
            <UserAvatar
              person={{ id: viewer.id, image: viewer.image }}
              className="size-10 rounded-md"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[17px] leading-[22px] font-semibold">
                {viewer.name}
              </span>
              <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                {viewer.email}
              </span>
            </span>
            <Button variant="ghost" size="lg" className="-mr-2 shrink-0" onClick={signOut}>
              {t("log_out")}
            </Button>
          </li>
        </GroupedList>
      </div>
      <NewCollectionDialog
        open={creating}
        onOpenChange={setCreating}
        existing={collections?.length ?? 0}
      />
      <ImportGistSheet
        open={importing}
        onOpenChange={setImporting}
        side={desktop ? "right" : "bottom"}
      />
    </div>
  )
}

// The Library route's loading state: the same page with its counts and collections still out.
export function LibraryLoading() {
  return <LibraryView counts={null} collections={null} />
}
