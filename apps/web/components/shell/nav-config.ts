import { LayoutGridIcon, type LucideIcon, MenuIcon, StarIcon, StickyNoteIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

// Bottom tabs below lg; the New paste button sits between the second and third tab, and More
// comes last. `match` lists the routes that light the tab up.
export const mobileTabs: (NavItem & { match: string[] })[] = [
  { href: "/dashboard", label: "home", icon: LayoutGridIcon, match: ["/dashboard"] },
  { href: "/pastes", label: "pastes", icon: StickyNoteIcon, match: ["/pastes"] },
  { href: "/starred", label: "starred", icon: StarIcon, match: ["/starred"] },
]

// "More" opens the More sheet rather than a page, and stays lit on every page the sheet leads to.
export const moreTab = {
  label: "more",
  icon: MenuIcon,
  match: ["/analytics", "/collections", "/secrets", "/shared", "/trash", "/settings"],
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Mobile screens that draw their own header (New paste, Paste detail) and take over the bottom of
// the screen with their own actions, per the Paper mobile artboards. Every screen with the tab bar
// keeps the top bar, so search and notifications are always one tap away.
export function mobileChrome(pathname: string) {
  // Paste detail and edit (/pastes/<slug>…) have their own back header and bottom actions.
  const pasteScreen = /^\/pastes\/[^/]+/.test(pathname)
  const editor = isActivePath(pathname, "/new") || pasteScreen
  // New secret group keeps the top bar but puts its Save bar where the tab bar goes.
  const secretEditor = isActivePath(pathname, "/secrets/new")

  return {
    topBar: !editor,
    tabBar: !editor && !secretEditor,
  }
}

// Titles for the top bar, keyed by the first path segment.
export const pageTitles: Record<string, string> = {
  dashboard: "dashboard",
  analytics: "analytics",
  pastes: "my_pastes",
  starred: "starred",
  shared: "shared_with_me",
  trash: "trash",
  new: "new_paste",
  settings: "settings",
  collections: "collections",
  secrets: "secrets",
}

// The top bar's title for a route. Deeper routes (a paste, a collection) name themselves with
// <HeaderTitle>, so they get no section title to flash before it.
export function pageTitle(pathname: string) {
  const [section = "", ...rest] = pathname.split("/").filter(Boolean)
  if (rest.length > 0) return ""
  return pageTitles[section] ?? ""
}
