import {
  LayoutGridIcon,
  type LucideIcon,
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
