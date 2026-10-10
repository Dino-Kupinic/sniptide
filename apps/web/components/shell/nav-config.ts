import { LayoutGridIcon, type LucideIcon, MenuIcon, StarIcon, StickyNoteIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

// Bottom tabs below lg; the New paste button sits between the second and third tab.
// `match` lists the routes that light the tab up.
export const mobileTabs: (NavItem & { match: string[] })[] = [
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

// Mobile screens that draw their own header (Settings, New paste, Paste detail) or take over the
// bottom of the screen with their own actions, per the Paper mobile artboards.
export function mobileChrome(pathname: string) {
  // Paste detail and edit (/pastes/<slug>…) have their own back header and bottom actions.
  const pasteScreen = /^\/pastes\/[^/]+/.test(pathname)
  const editor = isActivePath(pathname, "/new") || pasteScreen

  return {
    topBar: !editor && !isActivePath(pathname, "/settings"),
    tabBar: !editor,
  }
}

// Titles for the top bar, keyed by the first path segment.
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

// The top bar's title for a route. Deeper routes (a paste, a collection) name themselves with
// <HeaderTitle>, so they get no section title to flash before it.
export function pageTitle(pathname: string) {
  const [section = "", ...rest] = pathname.split("/").filter(Boolean)
  if (rest.length > 0) return ""
  return pageTitles[section] ?? ""
}
