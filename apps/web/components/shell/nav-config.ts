import {
  LayoutGridIcon,
  type LucideIcon,
  MenuIcon,
  StarIcon,
  StickyNoteIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import type { NavCounts } from "@/lib/mock-data"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  count?: keyof NavCounts
}

export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGridIcon },
  { href: "/pastes", label: "My pastes", icon: StickyNoteIcon, count: "pastes" },
  { href: "/starred", label: "Starred", icon: StarIcon, count: "starred" },
  { href: "/shared", label: "Shared with me", icon: UsersIcon, count: "shared" },
  { href: "/trash", label: "Trash", icon: Trash2Icon },
]

// Bottom tabs below lg; the New paste button sits between the second and third tab.
// `match` lists the routes that light the tab up.
export const mobileTabs: (Omit<NavItem, "count"> & { match: string[] })[] = [
  { href: "/dashboard", label: "Home", icon: LayoutGridIcon, match: ["/dashboard"] },
  { href: "/pastes", label: "Pastes", icon: StickyNoteIcon, match: ["/pastes"] },
  { href: "/starred", label: "Starred", icon: StarIcon, match: ["/starred"] },
  {
    href: "/settings",
    label: "More",
    icon: MenuIcon,
    match: ["/settings", "/shared", "/trash", "/collections"],
  },
]

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Mobile screens that draw their own header (Settings, New paste) or take over the bottom of
// the screen with their own actions (New paste), per the Paper mobile artboards.
export function mobileChrome(pathname: string) {
  return {
    topBar: !["/settings", "/new"].some((href) => isActivePath(pathname, href)),
    tabBar: !isActivePath(pathname, "/new"),
  }
}

// Breadcrumb titles for the top bar, keyed by the first path segment.
export const pageTitles: Record<string, string> = {
  dashboard: "Dashboard",
  pastes: "My pastes",
  starred: "Starred",
  shared: "Shared with me",
  trash: "Trash",
  new: "New paste",
  settings: "Settings",
  collections: "Collections",
}
