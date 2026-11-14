// The app tour: a few popovers that point a new account at the main parts of the app, one at a
// time. Each step names the elements it can point at through their `data-tour` attribute, in
// order of preference, because the sidebar holds them on desktop and the tab bar and top bar hold
// them on phones.

export type TourSide = "top" | "right" | "bottom"

export interface TourTarget {
  // The value of the element's `data-tour` attribute.
  name: string
  // Where the popover sits relative to the element.
  side: TourSide
  // A second text for a target that only leads to the feature, such as the More tab.
  body?: "bodyMore"
}

export interface TourStep {
  id: "new_paste" | "collections" | "search" | "agent"
  targets: readonly TourTarget[]
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "new_paste",
    targets: [
      { name: "new-paste", side: "right" },
      { name: "new-paste-tab", side: "top" },
    ],
  },
  {
    id: "search",
    targets: [
      { name: "search", side: "right" },
      { name: "search-mobile", side: "bottom" },
    ],
  },
  {
    id: "collections",
    targets: [
      { name: "collections", side: "right" },
      { name: "more-tab", side: "top", body: "bodyMore" },
    ],
  },
  { id: "agent", targets: [{ name: "agent", side: "bottom" }] },
]

export interface ResolvedTourStep {
  id: TourStep["id"]
  target: TourTarget
}

// The steps the current screen can show: each one with the first of its targets that is on
// screen, and without the steps that have none, such as the agent step after the widget was
// removed from the dashboard.
export function resolveTourSteps(
  isOnScreen: (name: string) => boolean,
  steps: readonly TourStep[] = TOUR_STEPS,
): ResolvedTourStep[] {
  return steps.flatMap((step) => {
    const target = step.targets.find((candidate) => isOnScreen(candidate.name))
    return target ? [{ id: step.id, target }] : []
  })
}

// The tour only runs on the dashboard, where every target is.
export const TOUR_PATH = "/dashboard"

// How the tour started: by itself for a new account, or from "Take the tour" in the account menu.
export type TourTrigger = "auto" | "menu"
