// The sidebar's layout (width, collapsed, folded sections and ordering), kept in a cookie so the server
// renders it the way it was left and nothing jumps on load. Shared by the server layout and the
// client shell, so it stays free of server-only imports.

export const SIDEBAR_COOKIE = "sidebar"

export const SIDEBAR_DEFAULT_WIDTH = 256
// Below this the sidebar collapses instead of getting narrower.
export const SIDEBAR_MIN_WIDTH = 200
// The widest it gets is a quarter of the window, but never narrower than the minimum.
export const sidebarMaxWidth = (windowWidth: number) =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.floor(windowWidth / 4))

export const SECTIONS = ["starred", "pastes", "folders", "collections"] as const
export type SectionId = (typeof SECTIONS)[number]

export interface SidebarState {
  width: number
  collapsed: boolean
  // Sections folded shut. Everything else is open.
  closed: SectionId[]
  sectionOrder: SectionId[]
  collectionOrder: string[]
}

export const defaultSidebarState: SidebarState = {
  width: SIDEBAR_DEFAULT_WIDTH,
  collapsed: false,
  closed: [],
  sectionOrder: [...SECTIONS],
  collectionOrder: [],
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
