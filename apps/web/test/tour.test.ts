import { describe, expect, test } from "bun:test"
import { resolveTourSteps, TOUR_STEPS } from "@/lib/tour"
import en from "@/messages/en/onboarding.json"

describe("tour steps", () => {
  test("the tour stays short", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(3)
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(5)
  })

  test("desktop points at the sidebar and the dashboard", () => {
    const desktop = new Set(["new-paste", "templates", "search", "collections", "agent"])
    expect(resolveTourSteps((name) => desktop.has(name))).toEqual([
      { id: "new_paste", target: { name: "new-paste", side: "right" } },
      { id: "templates", target: { name: "templates", side: "top" } },
      { id: "search", target: { name: "search", side: "right" } },
      { id: "collections", target: { name: "collections", side: "right" } },
      { id: "agent", target: { name: "agent", side: "bottom" } },
    ])
  })

  test("a phone points at the tab bar and the top bar, with its own text for More", () => {
    const phone = new Set(["new-paste-tab", "templates", "search-mobile", "more-tab", "agent"])
    expect(resolveTourSteps((name) => phone.has(name))).toEqual([
      { id: "new_paste", target: { name: "new-paste-tab", side: "top" } },
      { id: "templates", target: { name: "templates", side: "top" } },
      { id: "search", target: { name: "search-mobile", side: "bottom" } },
      { id: "collections", target: { name: "more-tab", side: "top", body: "bodyMore" } },
      { id: "agent", target: { name: "agent", side: "bottom" } },
    ])
  })

  test("a step without a target on screen is left out", () => {
    const withoutAgentWidget = new Set(["new-paste", "search", "collections"])
    expect(resolveTourSteps((name) => withoutAgentWidget.has(name)).map((step) => step.id)).toEqual(
      ["new_paste", "search", "collections"],
    )
    expect(resolveTourSteps(() => false)).toEqual([])
  })

  test("every step and every text a target asks for has a message", () => {
    const steps: Record<string, Record<string, string>> = en.Tour.steps
    for (const step of TOUR_STEPS) {
      expect(steps[step.id]?.title).toBeTruthy()
      expect(steps[step.id]?.body).toBeTruthy()
      for (const target of step.targets) {
        if (target.body) expect(steps[step.id]?.[target.body]).toBeTruthy()
      }
    }
  })
})
