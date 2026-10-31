"use client"

import { Logo } from "@sniptide/ui/components/logo"
import { Skeleton } from "@sniptide/ui/components/skeleton"
import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import type { SidebarState } from "@/components/shell/sidebar-state"
import { ListPageSkeleton } from "./list-skeletons"
import {
  AnalyticsSkeleton,
  DashboardSkeleton,
  EditorSkeleton,
  PasteDetailSkeleton,
  SecretDetailSkeleton,
  SettingsSkeleton,
} from "./page-skeletons"
import { LoadingRegion } from "./region"

// Authentication is checked before this shell streams. Navigation stays useful while its
// counts and personalized lists load, without displaying fabricated zero/empty states.
export function AppShellSkeleton({ sidebar }: { sidebar: SidebarState }) {
  const t = useTranslations("Core")
  return (
    <div className="flex min-h-svh bg-background lg:bg-sidebar">
      <aside
        style={{ width: sidebar.width }}
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col gap-5 p-4 lg:flex",
          sidebar.collapsed && "lg:hidden",
        )}
      >
        <Logo />
        <nav className="flex flex-col gap-1">
          {(
            [
              "dashboard",
              "pastes",
              "starred",
              "collections",
              "shared",
              "analytics",
              "settings",
            ] as const
          ).map((page) => (
            <Link
              key={page}
              href={`/${page}`}
              className="rounded-md px-2 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t(page)}
            </Link>
          ))}
        </nav>
        <LoadingRegion className="flex-1">
          {[0, 1, 2].map((section) => (
            <div key={section} className="mb-6 flex flex-col gap-3">
              <Skeleton className="mb-1 h-3 w-20" />
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </LoadingRegion>
        <LoadingRegion>
          <Skeleton className="h-9 w-full" />
        </LoadingRegion>
      </aside>
      <div
        className={cn(
          "min-w-0 flex-1 bg-background lg:my-2 lg:mr-2 lg:overflow-hidden lg:rounded-lg lg:border lg:border-border",
          sidebar.collapsed && "lg:ml-2",
        )}
      >
        <header className="flex h-[52px] items-center border-b border-border px-4">
          <Logo className="lg:hidden" />
          <LoadingRegion className="hidden lg:block">
            <Skeleton className="h-4 w-28" />
          </LoadingRegion>
        </header>
        <main id="main-content" tabIndex={-1} className="pb-20 lg:pb-0">
          <RouteSkeleton />
        </main>
        <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          {(["dashboard", "pastes", "new", "settings"] as const).map((page) => (
            <Link
              key={page}
              href={`/${page}`}
              className="rounded-md px-2 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t(page)}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

function RouteSkeleton() {
  const path = usePathname()
  if (path === "/dashboard") return <DashboardSkeleton />
  if (path === "/analytics") return <AnalyticsSkeleton />
  if (path === "/settings") return <SettingsSkeleton />
  if (path === "/new") return <EditorSkeleton />
  if (path.startsWith("/pastes/")) return <PasteDetailSkeleton editing={path.endsWith("/edit")} />
  if (path.startsWith("/secrets/")) return <SecretDetailSkeleton />
  if (path.startsWith("/collections/")) return <ListPageSkeleton kind="collection" />
  const kind = (["pastes", "starred", "shared", "trash", "collections", "secrets"] as const).find(
    (kind) => path === `/${kind}`,
  )
  return <ListPageSkeleton kind={kind} />
}
