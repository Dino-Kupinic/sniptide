import { FileTextIcon, FolderIcon, HouseIcon, type LucideIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

// Bottom tabs below lg, followed by the Search tab, which opens the command menu instead of a
// page. `match` lists the routes that light the tab up: Library stays lit on every page it lists.
export const mobileTabs: (NavItem & { match: string[] })[] = [
  { href: "/dashboard", label: "home", icon: HouseIcon, match: ["/dashboard"] },
  { href: "/pastes", label: "pastes", icon: FileTextIcon, match: ["/pastes"] },
  {
    href: "/library",
    label: "library",
    icon: FolderIcon,
    match: [
      "/library",
      "/starred",
      "/shared",
      "/collections",
      "/secrets",
      "/trash",
      "/analytics",
      "/settings",
    ],
  },
]

// Phone screens opened from the Library tab, which lead back to it from the top bar like an iOS
// navigation stack. A collection's own page counts too, since phones reach collections there.
const libraryScreens = [
  "/starred",
  "/shared",
  "/collections",
  "/secrets",
  "/trash",
  "/analytics",
  "/settings",
]

export function backToLibrary(pathname: string) {
  return libraryScreens.includes(pathname) || /^\/collections\/[^/]+$/.test(pathname)
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// A paste's own screens: its detail page and its editor (/pastes/<slug>…).
export function isPasteScreen(pathname: string) {
  return /^\/pastes\/[^/]+/.test(pathname)
}

// Mobile screens that draw their own header (New paste, Paste detail) and take over the bottom of
// the screen with their own actions, per the Paper mobile artboards. Every screen with the tab bar
// keeps the top bar, so search and notifications are always one tap away.
export function mobileChrome(pathname: string) {
  // Paste detail and edit have their own back header and bottom actions.
  const pasteScreen = isPasteScreen(pathname)
  const editor = isActivePath(pathname, "/new") || pasteScreen
  // New secret group keeps the top bar but puts its Save bar where the tab bar goes.
  const secretEditor = isActivePath(pathname, "/secrets/new")

  return {
    topBar: !editor,
    tabBar: !editor && !secretEditor,
  }
}

// Titles for the top bar, keyed by the first path segment.
const pageTitles: Record<string, string> = {
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
  templates: "paste_templates",
  library: "library",
}

// The top bar's title for a route. Deeper routes (a paste, a collection) name themselves with
// <HeaderTitle>, so they get no section title to flash before it.
export function pageTitle(pathname: string) {
  const [section = "", ...rest] = pathname.split("/").filter(Boolean)
  if (rest.length > 0) return ""
  return pageTitles[section] ?? ""
}
