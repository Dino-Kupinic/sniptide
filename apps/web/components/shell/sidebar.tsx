"use client"

import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Kbd } from "@workspace/ui/components/kbd"
import { Progress } from "@workspace/ui/components/progress"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronsUpDownIcon, LogOutIcon, PlusIcon, SettingsIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "@/components/logo"
import type { Collection, NavCounts, ViewerSummary } from "@/lib/mock-data"
import { primaryNav } from "./nav-config"

export interface SidebarProps {
  viewer: ViewerSummary
  counts: NavCounts
  collections: Collection[]
  onNavigate?: () => void
}

const markerClass: Record<Collection["marker"], string> = {
  "filled-primary": "bg-primary",
  "filled-foreground": "bg-foreground",
  "outline-primary": "border-2 border-primary",
  "outline-foreground": "border-2 border-foreground",
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

const navItemClass =
  "flex h-8 items-center gap-2.5 px-2.5 text-sm text-foreground/85 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0"

export function Sidebar({ viewer, counts, collections, onNavigate }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col gap-4 p-2 pt-4">
      <Link href="/dashboard" onClick={onNavigate} className="px-2 outline-none">
        <Logo />
      </Link>

      <Button
        size="lg"
        className="h-9 justify-start gap-2 px-3"
        render={<Link href="/new" onClick={onNavigate} />}
        nativeButton={false}
      >
        <PlusIcon />
        New paste
        <Kbd className="ml-auto">⌘N</Kbd>
      </Button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {primaryNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-active={isActive(pathname, item.href)}
            className={navItemClass}
          >
            <item.icon />
            {item.label}
            {item.count ? (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {counts[item.count]}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="sidebar-collections" className="flex flex-col gap-0.5">
        <div className="flex h-8 items-center justify-between px-2.5">
          <h2 id="sidebar-collections" className="text-xs text-muted-foreground">
            Collections
          </h2>
          <button
            type="button"
            aria-label="New collection"
            className="text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
        {collections.map((collection) => (
          <Link
            key={collection.slug}
            href={`/collections/${collection.slug}`}
            onClick={onNavigate}
            data-active={isActive(pathname, `/collections/${collection.slug}`)}
            className={cn(navItemClass, "font-mono text-[13px]")}
          >
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0", markerClass[collection.marker])}
            />
            {collection.name}
          </Link>
        ))}
      </section>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          data-active={isActive(pathname, "/settings")}
          className={navItemClass}
        >
          <SettingsIcon />
          Settings
        </Link>

        <div className="flex flex-col gap-3 border border-border bg-background p-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium">Storage</span>
            <span className="text-muted-foreground tabular-nums">
              {viewer.storageUsedMb} / {viewer.storageLimitMb} MB
            </span>
          </div>
          <Progress value={(viewer.storageUsedMb / viewer.storageLimitMb) * 100} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 p-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted">
            <Avatar>
              <AvatarFallback>{viewer.initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{viewer.name}</span>
              <span className="truncate text-xs text-muted-foreground">{viewer.email}</span>
            </span>
            <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="w-(--anchor-width)">
            <DropdownMenuLabel>{viewer.email}</DropdownMenuLabel>
            <DropdownMenuItem render={<Link href="/settings" onClick={onNavigate} />}>
              <UserIcon />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings" onClick={onNavigate} />}>
              <SettingsIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
