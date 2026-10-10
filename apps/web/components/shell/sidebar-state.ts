// The sidebar's layout (width, collapsed, folded sections), kept in a cookie so the server
// renders it the way it was left and nothing jumps on load. Shared by the server layout and the
// client shell, so it stays free of server-only imports.

export const SIDEBAR_COOKIE = "sidebar"

export const SIDEBAR_DEFAULT_WIDTH = 256
// Below this the sidebar collapses instead of getting narrower.
export const SIDEBAR_MIN_WIDTH = 200
// The widest it gets is a quarter of the window, but never narrower than the minimum.
export const sidebarMaxWidth = (windowWidth: number) =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.floor(windowWidth / 4))

export const SECTIONS = ["starred", "pastes", "collections"] as const
export type SectionId = (typeof SECTIONS)[number]

export interface SidebarState {
  width: number
  collapsed: boolean
  // Sections folded shut. Everything else is open.
  closed: SectionId[]
}

export const defaultSidebarState: SidebarState = {
  width: SIDEBAR_DEFAULT_WIDTH,
  collapsed: false,
  closed: [],
}

export function parseSidebarState(value: string | undefined): SidebarState {
  if (!value) return defaultSidebarState
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Partial<SidebarState>
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
