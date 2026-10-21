import { describe, expect, test } from "bun:test"
import {
  completeSidebarOrder,
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
