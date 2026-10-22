// The sidebar's layout (width, collapsed, folded sections and ordering), kept in a cookie so the server
// renders it the way it was left and nothing jumps on load. Shared by the server layout and the
// client shell, so it stays free of server-only imports.

import { SIDEBAR_RECENT, SIDEBAR_STARRED } from "@/lib/pastes/types"

export const SIDEBAR_COOKIE = "sidebar"

export const SIDEBAR_DEFAULT_WIDTH = 256
// Below this the sidebar collapses instead of getting narrower.
export const SIDEBAR_MIN_WIDTH = 200
// The widest it gets is a quarter of the window, but never narrower than the minimum.
export const sidebarMaxWidth = (windowWidth: number) =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.floor(windowWidth / 4))

export const SECTIONS = ["starred", "pastes", "collections"] as const
export type SectionId = (typeof SECTIONS)[number]

// What the Starred and Pastes sections list, picked in their filter and ⋯ menus. The sorts match
// the paste list's, so "View all" opens the same view.
export const SIDEBAR_VISIBILITIES = ["all", "public", "unlisted", "private"] as const
export const SIDEBAR_SORTS = ["updated", "views", "title"] as const
export const SIDEBAR_LIMITS = [3, 5, 8, 15] as const
export type SidebarVisibility = (typeof SIDEBAR_VISIBILITIES)[number]
export type SidebarSort = (typeof SIDEBAR_SORTS)[number]

export interface PasteSectionView {
  visibility: SidebarVisibility
  sort: SidebarSort
  limit: number
}

// Collections keep the order you drag them into, or sort by name.
export const COLLECTION_SORTS = ["custom", "name"] as const
export type CollectionSort = (typeof COLLECTION_SORTS)[number]

export interface SidebarViews {
  pastes: PasteSectionView
  starred: PasteSectionView
  collections: { sort: CollectionSort }
}

export const defaultSidebarViews: SidebarViews = {
  pastes: { visibility: "all", sort: "updated", limit: SIDEBAR_RECENT },
  starred: { visibility: "all", sort: "updated", limit: SIDEBAR_STARRED },
  collections: { sort: "custom" },
}

function parsePasteView(raw: unknown, fallback: PasteSectionView): PasteSectionView {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    visibility:
      SIDEBAR_VISIBILITIES.find((item) => item === value.visibility) ?? fallback.visibility,
    sort: SIDEBAR_SORTS.find((item) => item === value.sort) ?? fallback.sort,
    limit: SIDEBAR_LIMITS.find((item) => item === value.limit) ?? fallback.limit,
  }
}

export function parseSidebarViews(raw: unknown): SidebarViews {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const collections =
    value.collections && typeof value.collections === "object"
      ? (value.collections as Record<string, unknown>)
      : {}
  return {
    pastes: parsePasteView(value.pastes, defaultSidebarViews.pastes),
    starred: parsePasteView(value.starred, defaultSidebarViews.starred),
    collections: {
      sort: COLLECTION_SORTS.find((item) => item === collections.sort) ?? "custom",
    },
  }
}

// Whether a section shows something other than its default list, so its filter button stays
// visible as a reminder.
export function isFiltered(view: PasteSectionView) {
  return view.visibility !== "all" || view.sort !== "updated"
}

export interface SidebarState {
  width: number
  collapsed: boolean
  // Sections folded shut. Everything else is open.
  closed: SectionId[]
  sectionOrder: SectionId[]
  collectionOrder: string[]
  views: SidebarViews
}

export const defaultSidebarState: SidebarState = {
  width: SIDEBAR_DEFAULT_WIDTH,
  collapsed: false,
  closed: [],
  sectionOrder: [...SECTIONS],
  collectionOrder: [],
  views: defaultSidebarViews,
}

// Keep the saved order for surviving items and append newly available ones. This also makes
// older cookies and preferences with stale or duplicate IDs safe to render.
export function completeSidebarOrder<T extends string>(
  saved: unknown,
  available: readonly T[],
): T[] {
  const known = new Set<string>(available)
  const ordered = Array.isArray(saved)
    ? saved.filter((id): id is T => typeof id === "string" && known.has(id))
    : []
  return [...new Set([...ordered, ...available])]
}

export function parseSidebarState(value: string | undefined): SidebarState {
  if (!value) return defaultSidebarState
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Partial<SidebarState>
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultSidebarState
    const width = Number(raw.width)
    return {
      width:
        Number.isFinite(width) && width >= SIDEBAR_MIN_WIDTH
          ? Math.round(Math.min(width, 1200))
          : SIDEBAR_DEFAULT_WIDTH,
      collapsed: raw.collapsed === true,
      closed: Array.isArray(raw.closed)
        ? SECTIONS.filter((section) => raw.closed?.includes(section))
        : [],
      sectionOrder: completeSidebarOrder(raw.sectionOrder, SECTIONS),
      collectionOrder: Array.isArray(raw.collectionOrder)
        ? [
            ...new Set(
              raw.collectionOrder.filter(
                (id) => typeof id === "string" && /^[a-z0-9-]{1,40}$/.test(id),
              ),
            ),
          ].slice(0, 50)
        : [],
      views: parseSidebarViews(raw.views),
    }
  } catch {
    return defaultSidebarState
  }
}

export function writeSidebarState(state: SidebarState) {
  const value = encodeURIComponent(JSON.stringify(state))
  // biome-ignore lint/suspicious/noDocumentCookie: one small preference cookie; no store needed.
  document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
}
