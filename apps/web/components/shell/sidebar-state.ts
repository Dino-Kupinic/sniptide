// The sidebar's layout (width, collapsed, folded sections and ordering), kept in a cookie so the server
// renders it the way it was left and nothing jumps on load. Shared by the server layout and the
// client shell, so it stays free of server-only imports.

import { WIDGETS, type WidgetId } from "@/lib/dashboard/widgets"
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
type SidebarVisibility = (typeof SIDEBAR_VISIBILITIES)[number]
type SidebarSort = (typeof SIDEBAR_SORTS)[number]

export interface PasteSectionView {
  visibility: SidebarVisibility
  sort: SidebarSort
  limit: number
}

// Collections keep the order you drag them into, or sort by name.
const COLLECTION_SORTS = ["custom", "name"] as const
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

function parseSidebarViews(raw: unknown): SidebarViews {
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

// What the sidebar's lists held when they last loaded. The server reads it to draw their
// placeholder with the same sections and row counts, so nothing moves when the lists arrive.
export interface SidebarShape {
  // Rows in each section. Starred is null while there are no stars, which hides the section.
  starred: number | null
  pastes: number
  collections: number
  // Sections that ended in a "View all" link.
  viewAll: SectionId[]
  // Rows on the first page of each list page, or null while that is unknown.
  pages: Record<ListPage, number | null>
  // The height in pixels each dashboard widget last had in this browser.
  widgets: Partial<Record<WidgetId, number>>
}

export const LIST_PAGES = ["pastes", "starred", "shared", "trash"] as const
export type ListPage = (typeof LIST_PAGES)[number]
// A list page shows this many rows at most, the page size of lib/pastes/list-query.ts.
const LIST_PAGE_ROWS = 10

// Rows a list page of `total` items opens with.
export const firstPageRows = (total: number) => Math.min(total, LIST_PAGE_ROWS)

const defaultSidebarShape: SidebarShape = {
  starred: null,
  pastes: 1,
  collections: 0,
  viewAll: [],
  pages: { pastes: null, starred: null, shared: null, trash: null },
  widgets: {},
}

// Row counts stay within what a section can list.
function parseRows(value: unknown, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, max)
    : null
}

function parseWidgetHeights(raw: unknown) {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const heights: SidebarShape["widgets"] = {}
  for (const widget of WIDGETS) {
    const height = value[widget]
    if (typeof height === "number" && Number.isInteger(height) && height > 0 && height <= 4000) {
      heights[widget] = height
    }
  }
  return heights
}

function parseSidebarShape(raw: unknown): SidebarShape {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const limit = SIDEBAR_LIMITS[SIDEBAR_LIMITS.length - 1] ?? 15
  const pages =
    value.pages && typeof value.pages === "object" ? (value.pages as Record<string, unknown>) : {}
  return {
    starred: parseRows(value.starred, limit),
    pastes: parseRows(value.pastes, limit) ?? defaultSidebarShape.pastes,
    collections: parseRows(value.collections, 50) ?? defaultSidebarShape.collections,
    viewAll: Array.isArray(value.viewAll)
      ? SECTIONS.filter((section) => (value.viewAll as unknown[]).includes(section))
      : [],
    pages: {
      pastes: parseRows(pages.pastes, LIST_PAGE_ROWS),
      starred: parseRows(pages.starred, LIST_PAGE_ROWS),
      shared: parseRows(pages.shared, LIST_PAGE_ROWS),
      trash: parseRows(pages.trash, LIST_PAGE_ROWS),
    },
    widgets: parseWidgetHeights(value.widgets),
  }
}

export interface SidebarState {
  width: number
  collapsed: boolean
  // Sections folded shut. Everything else is open.
  closed: SectionId[]
  sectionOrder: SectionId[]
  collectionOrder: string[]
  views: SidebarViews
  shape: SidebarShape
  // The browser's time zone, so the server greets by the viewer's time of day.
  timeZone: string | null
}

export const defaultSidebarState: SidebarState = {
  width: SIDEBAR_DEFAULT_WIDTH,
  collapsed: false,
  closed: [],
  sectionOrder: [...SECTIONS],
  collectionOrder: [],
  views: defaultSidebarViews,
  shape: defaultSidebarShape,
  timeZone: null,
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
      shape: parseSidebarShape(raw.shape),
      timeZone:
        typeof raw.timeZone === "string" && /^[\w+\-/]{1,64}$/.test(raw.timeZone)
          ? raw.timeZone
          : null,
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

export type DayPart = "morning" | "afternoon" | "evening"

// The part of the day at `date` in a time zone, or in the runtime's own zone without one. An
// unknown zone gives null.
export function dayPart(date: Date, timeZone?: string): DayPart | null {
  let hour: number
  try {
    hour = timeZone
      ? Number(
          new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(
            date,
          ),
        )
      : date.getHours()
  } catch {
    return null
  }
  if (!Number.isInteger(hour)) return null
  return hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"
}
