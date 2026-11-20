// The app tour: a few popovers that point a new account at the main parts of the app, one at a
// time. Each step names the elements it can point at through their `data-tour` attribute, in
// order of preference, because the sidebar holds them on desktop and the tab bar and top bar hold
// them on phones.

type TourSide = "top" | "right" | "bottom"

interface TourTarget {
  // The value of the element's `data-tour` attribute.
  name: string
  // Where the popover sits relative to the element.
  side: TourSide
  // A second text for a target that only leads to the feature, such as the Library tab.
  body?: "bodyLibrary"
}

export interface TourStep {
  id: "new_paste" | "templates" | "collections" | "search" | "agent"
  targets: readonly TourTarget[]
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "new_paste",
    targets: [
      { name: "new-paste", side: "right" },
      { name: "new-paste-mobile", side: "bottom" },
    ],
  },
  // The Paste templates widget, right after New paste: the other way to make a first paste.
  { id: "templates", targets: [{ name: "templates", side: "top" }] },
  {
    id: "search",
    targets: [
      { name: "search", side: "right" },
      { name: "search-tab", side: "top" },
    ],
  },
  {
    id: "collections",
    targets: [
      { name: "collections", side: "right" },
      { name: "library-tab", side: "top", body: "bodyLibrary" },
    ],
  },
  { id: "agent", targets: [{ name: "agent", side: "bottom" }] },
]

export interface ResolvedTourStep {
  id: TourStep["id"]
  target: TourTarget
}

// The steps the current screen can show: each one with the first of its targets that is on
// screen, and without the steps that have none, such as the agent or templates step after its
// widget was removed from the dashboard.
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
