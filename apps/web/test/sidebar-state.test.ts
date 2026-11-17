import { describe, expect, test } from "bun:test"
import {
  completeSidebarOrder,
  dayPart,
  defaultSidebarState,
  defaultSidebarViews,
  parseSidebarState,
  SECTIONS,
  type SidebarState,
} from "@/components/shell/sidebar-state"

const cookie = (value: unknown) => encodeURIComponent(JSON.stringify(value))

describe("sidebar preferences", () => {
  test("older cookies retain width and folded sections with default ordering", () => {
    expect(parseSidebarState(cookie({ width: 288, collapsed: true, closed: ["pastes"] }))).toEqual({
      ...defaultSidebarState,
      width: 288,
      collapsed: true,
      closed: ["pastes"],
    })
  })

  test("custom section and collection ordering survives serialization", () => {
    const state: SidebarState = {
      ...defaultSidebarState,
      sectionOrder: ["collections", "pastes", "starred"],
      collectionOrder: ["pastes", "api-snippets", "general"],
      closed: ["pastes"],
    }
    expect(parseSidebarState(cookie(state))).toEqual(state)
  })

  test("invalid, duplicate and missing section IDs cannot hide or duplicate sections", () => {
    expect(
      parseSidebarState(cookie({ sectionOrder: ["collections", "unknown", "collections", null] }))
        .sectionOrder,
    ).toEqual(["collections", "starred", "pastes"])
    for (const value of [undefined, "%", "null", "[]", "1", cookie({ sectionOrder: "pastes" })]) {
      expect(parseSidebarState(value).sectionOrder).toEqual([...SECTIONS])
    }
  })

  test("old draggable General preferences cannot fold or reorder the fixed navigation", () => {
    expect(
      parseSidebarState(
        cookie({
          closed: ["general", "pastes"],
          sectionOrder: ["collections", "general", "starred", "pastes"],
        }),
      ),
    ).toMatchObject({ closed: ["pastes"], sectionOrder: ["collections", "starred", "pastes"] })
  })

  test("the remembered shape survives serialization and drops what no list could hold", () => {
    const shape: SidebarState["shape"] = {
      starred: 3,
      pastes: 8,
      collections: 4,
      viewAll: ["starred", "pastes"],
      pages: { pastes: 10, starred: 3, shared: 0, trash: null },
      widgets: { recent_pastes: 420, starred: 196 },
    }
    expect(parseSidebarState(cookie({ shape })).shape).toEqual(shape)
    expect(
      parseSidebarState(
        cookie({
          shape: {
            starred: -1,
            pastes: "many",
            collections: 4.5,
            viewAll: ["unknown", "pastes"],
            pages: { pastes: 500, starred: "x" },
            widgets: { recent_pastes: 0, unknown: 300, starred: 99999, popular: 240.5 },
          },
        }),
      ).shape,
    ).toEqual({
      ...defaultSidebarState.shape,
      viewAll: ["pastes"],
      pages: { ...defaultSidebarState.shape.pages, pastes: 10 },
    })
    expect(parseSidebarState(cookie({ width: 288 })).shape).toEqual(defaultSidebarState.shape)
  })

  test("the time zone survives serialization and anything else is dropped", () => {
    expect(parseSidebarState(cookie({ timeZone: "Europe/Vienna" })).timeZone).toBe("Europe/Vienna")
    expect(parseSidebarState(cookie({ timeZone: "Etc/GMT+5" })).timeZone).toBe("Etc/GMT+5")
    for (const timeZone of [5, "", "a b", "<script>", "x".repeat(65)]) {
      expect(parseSidebarState(cookie({ timeZone })).timeZone).toBeNull()
    }
  })

  test("the part of the day follows the time zone", () => {
    const noonUtc = new Date("2026-06-01T12:00:00Z")
    expect(dayPart(noonUtc, "UTC")).toBe("afternoon")
    expect(dayPart(noonUtc, "America/Los_Angeles")).toBe("morning")
    expect(dayPart(noonUtc, "Asia/Tokyo")).toBe("evening")
    expect(dayPart(new Date("2026-06-01T03:00:00Z"), "UTC")).toBe("evening")
    expect(dayPart(noonUtc, "Not/AZone")).toBeNull()
  })

  test("new collections append and deleted collections disappear without resetting the order", () => {
    expect(
      completeSidebarOrder(["deleted", "last", "first", "last"], ["first", "new", "last"]),
    ).toEqual(["last", "first", "new"])
    expect(completeSidebarOrder(["deleted"], [])).toEqual([])
  })

  test("collection preferences are bounded and fit the cookie at the collection limit", () => {
    const slugs = Array.from({ length: 50 }, (_, i) => `${i}-`.padEnd(40, "a"))
    const state = parseSidebarState(
      cookie({ collectionOrder: [null, {}, "bad/name", ...slugs, ...slugs] }),
    )
    expect(state.collectionOrder).toEqual(slugs)
    expect(`sidebar=${cookie(state)}; path=/; max-age=31536000; samesite=lax`.length).toBeLessThan(
      4096,
    )
  })

  test("section filters survive serialization and unknown values fall back to the defaults", () => {
    const views = {
      pastes: { visibility: "private", sort: "title", limit: 15 },
      starred: { visibility: "public", sort: "views", limit: 5 },
      collections: { sort: "name" },
    }
    expect(parseSidebarState(cookie({ views })).views).toEqual(views as typeof defaultSidebarViews)
    expect(
      parseSidebarState(
        cookie({
          views: { pastes: { visibility: "secret", sort: "expires", limit: 999 }, starred: "x" },
        }),
      ).views,
    ).toEqual(defaultSidebarViews)
  })
})
