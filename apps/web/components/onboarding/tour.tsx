"use client"

import { Button } from "@sniptide/ui/components/button"
import { Popover, PopoverContent, PopoverTitle } from "@sniptide/ui/components/popover"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { track } from "@/lib/analytics"
import { markTourSeen } from "@/lib/onboarding-actions"
import { type ResolvedTourStep, resolveTourSteps, TOUR_PATH, type TourTrigger } from "@/lib/tour"

// Long enough for the dashboard to settle after the welcome wizard or a closing menu, so the first
// popover doesn't open against a layout that is still moving.
const START_DELAY_MS = 500

const TourContext = React.createContext<{ start: () => void } | null>(null)

// Starts the tour from anywhere inside the app shell, as "Take the tour" in the account menu does.
export function useTour() {
  const tour = React.useContext(TourContext)
  if (!tour) throw new Error("useTour must be used inside TourProvider")
  return tour
}

// The first element on screen that carries the target's name. The sidebar and the tab bar are both
// in the document, and only one of them is displayed.
function findTarget(name: string) {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (element.getClientRects().length > 0) return element
  }
  return null
}

interface Run {
  trigger: TourTrigger
  steps: ResolvedTourStep[]
  index: number
}

// The app tour: one popover at a time, anchored to the control it describes, with the control
// outlined. It starts by itself once for a new account and again from the account menu. The page
// stays usable while it runs, and the tour ends when the person skips it, presses Escape, finishes
// the last step or leaves the dashboard. Every start, step and ending is reported to PostHog.
export function TourProvider({
  autoStart,
  onBeforeStart,
  children,
}: {
  // Whether this account still has its one unasked tour.
  autoStart: boolean
  // Runs before the targets are looked up, so the shell can bring the sidebar back.
  onBeforeStart: () => void
  children: React.ReactNode
}) {
  const t = useTranslations("Tour")
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = React.useState<TourTrigger | null>(autoStart ? "auto" : null)
  const [run, setRunState] = React.useState<Run | null>(null)
  // The run as event handlers and effects read it, so an ending is reported exactly once.
  const runRef = React.useRef<Run | null>(null)
  const setRun = React.useCallback((next: Run | null) => {
    runRef.current = next
    setRunState(next)
  }, [])
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const nextRef = React.useRef<HTMLButtonElement>(null)
  const beforeStart = React.useRef(onBeforeStart)
  beforeStart.current = onBeforeStart

  const onDashboard = pathname === TOUR_PATH
  const step = run ? (run.steps[run.index] ?? null) : null
  // The popover keeps its last step while it closes.
  const shown = React.useRef<{ step: ResolvedTourStep; number: number; total: number } | null>(null)
  if (run && step) shown.current = { step, number: run.index + 1, total: run.steps.length }

  React.useEffect(() => {
    if (!pending || !onDashboard) return
    beforeStart.current()
    const timer = setTimeout(() => {
      const steps = resolveTourSteps((name) => findTarget(name) !== null)
      setPending(null)
      if (steps.length === 0) return
      // A failed save only means the tour may start once more on the next visit.
      if (pending === "auto") void markTourSeen().catch(() => undefined)
      track("tour_started", { trigger: pending, steps: steps.length })
      setRun({ trigger: pending, steps, index: 0 })
    }, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pending, onDashboard, setRun])

  const finish = React.useCallback(
    (outcome: "completed" | "skipped", reason?: "dismissed" | "navigated" | "target_gone") => {
      const current = runRef.current
      const last = current?.steps[current.index]
      if (!current || !last) return
      track(outcome === "completed" ? "tour_completed" : "tour_skipped", {
        trigger: current.trigger,
        step: last.id,
        step_number: current.index + 1,
        steps: current.steps.length,
        ...(reason ? { reason } : {}),
      })
      setRun(null)
    },
    [setRun],
  )

  // The targets live on the dashboard, so going anywhere else ends the tour.
  React.useEffect(() => {
    if (!onDashboard) finish("skipped", "navigated")
  }, [onDashboard, finish])

  React.useEffect(() => {
    const current = runRef.current
    if (!step || !current) {
      setAnchor(null)
      return
    }
    const element = findTarget(step.target.name)
    if (!element) {
      finish("skipped", "target_gone")
      return
    }
    element.setAttribute("data-tour-current", "")
    element.scrollIntoView({ block: "nearest" })
    setAnchor(element)
    track("tour_step_viewed", {
      trigger: current.trigger,
      step: step.id,
      step_number: current.index + 1,
    })
    // A target can leave the screen mid-tour: a widget gets removed, or the window crosses the
    // width where the sidebar gives way to the tab bar. The observer reports both as an empty box.
    const observer = new ResizeObserver(() => {
      if (element.getClientRects().length === 0) finish("skipped", "target_gone")
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      element.removeAttribute("data-tour-current")
    }
  }, [step, finish])

  const start = React.useCallback(() => {
    finish("skipped", "dismissed")
    setPending("menu")
    if (!onDashboard) router.push(TOUR_PATH)
  }, [onDashboard, router, finish])

  const context = React.useMemo(() => ({ start }), [start])
  const view = shown.current
  const last = view ? view.number === view.total : false

  return (
    <TourContext.Provider value={context}>
      {children}
      <Popover
        open={step !== null && anchor !== null}
        onOpenChange={(open, details) => {
          // Clicks and focus outside leave the tour open, so the page stays usable beside it.
          if (!open && details.reason === "escape-key") finish("skipped", "dismissed")
        }}
      >
        {view ? (
          <PopoverContent
            anchor={anchor}
            side={view.step.target.side}
            align="start"
            sideOffset={10}
            collisionPadding={12}
            initialFocus={nextRef}
            data-tour-step={view.step.id}
            className="flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-3 p-4"
          >
            <div aria-live="polite" className="flex flex-col gap-1">
              <PopoverTitle className="text-sm leading-5 font-medium">
                {t(`steps.${view.step.id}.title`)}
              </PopoverTitle>
              <p className="text-sm leading-5 text-muted-foreground">
                {view.step.id === "collections" && view.step.target.body
                  ? t(`steps.collections.${view.step.target.body}`)
                  : t(`steps.${view.step.id}.body`)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                {t("progress", { current: view.number, total: view.total })}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {last ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="max-lg:h-10"
                    onClick={() => finish("skipped", "dismissed")}
                  >
                    {t("skip")}
                  </Button>
                )}
                <Button
                  ref={nextRef}
                  size="sm"
                  className="max-lg:h-[38px]"
                  onClick={() => {
                    const current = runRef.current
                    if (last) finish("completed")
                    else if (current) setRun({ ...current, index: current.index + 1 })
                  }}
                >
                  {last ? t("done") : t("next")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        ) : null}
      </Popover>
    </TourContext.Provider>
  )
}
