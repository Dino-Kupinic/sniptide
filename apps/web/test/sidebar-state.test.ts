import { describe, expect, test } from "bun:test"
import {
  completeSidebarOrder,
  defaultSidebarState,
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
      sectionOrder: ["collections", "pastes", "general", "starred"],
      collectionOrder: ["pastes", "api-snippets", "general"],
      closed: ["general"],
    }
    expect(parseSidebarState(cookie(state))).toEqual(state)
  })

  test("invalid, duplicate and missing section IDs cannot hide or duplicate sections", () => {
    expect(
      parseSidebarState(cookie({ sectionOrder: ["collections", "unknown", "collections", null] }))
        .sectionOrder,
    ).toEqual(["collections", "general", "starred", "pastes"])
    for (const value of [undefined, "%", "null", "[]", "1", cookie({ sectionOrder: "pastes" })]) {
      expect(parseSidebarState(value).sectionOrder).toEqual([...SECTIONS])
    }
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
})
