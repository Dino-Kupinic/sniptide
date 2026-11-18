"use client"

import { Button } from "@sniptide/ui/components/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  sheetRowClass,
} from "@sniptide/ui/components/sheet"
import {
  ChartColumnIcon,
  DownloadIcon,
  FolderIcon,
  KeyRoundIcon,
  type LucideIcon,
  SettingsIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useCommandMenu } from "@/components/command-menu/command-menu"
import { UserAvatar } from "@/components/people/user-avatar"
import { useSiteOrigin } from "@/components/site-host"
import { signOut as signOutAccount } from "@/lib/auth-client"
import { profilePath } from "@/lib/profile-path"
import type { ViewerSummary } from "@/lib/viewer"
import { isActivePath } from "./nav-config"
import { useSettledShellData } from "./shell-data"

export interface MoreCounts {
  collections: number
  shared: number
  trash: number
}

// The pages the sidebar holds beyond the three main tabs, opened from the tab bar's More button.
// Trash stays last among them, as in the sidebar; Settings and the account sit below a divider.
export function MoreSheet({
  open,
  onOpenChange,
  viewer,
  counts: given,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  viewer: ViewerSummary
  counts?: MoreCounts
}) {
  // Inside the app shell the counts join their rows once the shell's data has arrived.
  const shell = useSettledShellData()
  const counts =
    given ??
    (shell && {
      collections: shell.collections.length,
      shared: shell.sidebar.counts.shared,
      trash: shell.trashCount,
    })
  const t = useTranslations("Workspace")
  const origin = useSiteOrigin()
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { importGist } = useCommandMenu()
  const format = new Intl.NumberFormat(locale)
  const close = () => onOpenChange(false)

  const pages: { href: string; label: string; icon: LucideIcon; count?: number }[] = [
    { href: "/analytics", label: t("analytics"), icon: ChartColumnIcon },
    {
      href: "/collections",
      label: t("collections"),
      icon: FolderIcon,
      count: counts?.collections,
    },
    { href: "/secrets", label: t("secrets"), icon: KeyRoundIcon },
    {
      href: "/shared",
      label: t("shared_with_me"),
      icon: UsersIcon,
      count: counts?.shared,
    },
    { href: "/trash", label: t("trash"), icon: Trash2Icon, count: counts?.trash },
  ]

  async function signOut() {
    close()
    await signOutAccount()
    router.replace("/sign-in")
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader title={t("more")} closeLabel={t("close")} />
        <SheetBody>
          <nav aria-label={t("more")} className="flex flex-col">
            {pages.map((page) => (
              <PageRow
                key={page.href}
                {...page}
                count={page.count ? format.format(page.count) : undefined}
                pathname={pathname}
                onNavigate={close}
              />
            ))}
            {importGist ? (
              <button
                type="button"
                className={sheetRowClass}
                onClick={() => {
                  close()
                  importGist()
                }}
              >
                <DownloadIcon />
                {t("import_gist")}
              </button>
            ) : null}
            <hr className="my-1 border-border" />
            {viewer.username ? (
              <a href={`${origin}${profilePath(viewer.username)}`} className={sheetRowClass}>
                <UserIcon />
                <span className="min-w-0 flex-1 truncate">{t("your_profile")}</span>
              </a>
            ) : null}
            <PageRow
              href="/settings"
              label={t("settings")}
              icon={SettingsIcon}
              pathname={pathname}
              onNavigate={close}
            />
          </nav>
          <div className="flex min-h-14 items-center gap-3 px-3 py-2">
            <UserAvatar
              person={{ id: viewer.id, image: viewer.image }}
              className="size-9 rounded-lg"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{viewer.name}</span>
              <span className="truncate text-[13px] text-muted-foreground">{viewer.email}</span>
            </div>
            <Button variant="ghost" size="xl" className="-mr-1 shrink-0" onClick={signOut}>
              {t("log_out")}
            </Button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

// A 48px link row with its count, if it has one, at the far end.
function PageRow({
  href,
  label,
  icon: Icon,
  count,
  pathname,
  onNavigate,
}: {
  href: string
  label: string
  icon: LucideIcon
  count?: string
  pathname: string
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      aria-current={isActivePath(pathname, href) ? "page" : undefined}
      onClick={onNavigate}
      className={sheetRowClass}
    >
      <Icon />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? (
        <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </Link>
  )
}
