"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { cn } from "@sniptide/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  type LucideIcon,
  PanelRightIcon,
} from "lucide-react"
import * as React from "react"

// The side panel next to the editor and the code view: a stack of sections that are collapsed to
// an icon and a label until you open them. The panel toggle in the code card's bar shrinks the
// whole panel to a rail of icons, which gives the code the room; clicking an icon in the rail
// brings the panel back with that section open.

export interface PanelSection {
  id: string
  label: string
  icon: LucideIcon
  content: React.ReactNode
  // A small dot on the rail icon when the section holds something worth knowing (a password on).
  marked?: boolean
}

const PanelContext = React.createContext<{
  rail: boolean
  setRail: (rail: boolean) => void
}>({ rail: false, setRail: () => {} })

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const [rail, setRail] = React.useState(false)
  const value = React.useMemo(() => ({ rail, setRail }), [rail])
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export const panelToolClass =
  "inline-flex size-8 shrink-0 items-center justify-center text-foreground/75 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:bg-muted aria-pressed:text-foreground [&_svg]:size-4"

// Lives in the code card's bar, after a divider. Desktop only, like the panel.
export function SidePanelToggle() {
  const { rail, setRail } = React.useContext(PanelContext)
  return (
    <>
      <span aria-hidden="true" className="mx-1.5 hidden h-4 w-px bg-border lg:block" />
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={rail ? "Show side panel" : "Hide side panel"}
          aria-expanded={!rail}
          onClick={() => setRail(!rail)}
          className={cn(panelToolClass, "hidden lg:inline-flex")}
        >
          <PanelRightIcon />
        </TooltipTrigger>
        <TooltipContent side="bottom">{rail ? "Show panel" : "Hide panel"}</TooltipContent>
      </Tooltip>
    </>
  )
}

export function SidePanel({
  sections,
  label,
  defaultOpen = [],
  className,
}: {
  sections: PanelSection[]
  label: string
  defaultOpen?: string[]
  className?: string
}) {
  const { rail, setRail } = React.useContext(PanelContext)
  const [open, setOpen] = React.useState<string[]>(defaultOpen)
  const toggle = (id: string) =>
    setOpen((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )

  if (rail) {
    return (
      <nav
        aria-label={label}
        className={cn(
          "hidden w-11 shrink-0 flex-col items-center border border-border lg:flex",
          className,
        )}
      >
        <button
          type="button"
          aria-label="Show side panel"
          onClick={() => setRail(false)}
          className={cn(panelToolClass, "my-1.5")}
        >
          <ChevronLeftIcon />
        </button>
        <span aria-hidden="true" className="h-px w-6 bg-border" />
        <div className="flex flex-col gap-0.5 py-1.5">
          {sections.map((section) => (
            <Tooltip key={section.id}>
              <TooltipTrigger
                type="button"
                aria-label={section.label}
                onClick={() => {
                  setOpen((current) =>
                    current.includes(section.id) ? current : [...current, section.id],
                  )
                  setRail(false)
                }}
                className={cn(panelToolClass, "relative")}
              >
                <section.icon />
                {section.marked ? (
                  <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 bg-link" />
                ) : null}
              </TooltipTrigger>
              <TooltipContent side="left">{section.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </nav>
    )
  }

  return (
    <section
      aria-label={label}
      className={cn(
        "hidden w-[272px] shrink-0 flex-col divide-y divide-border border border-border lg:flex xl:w-[300px]",
        className,
      )}
    >
      {sections.map((section) => {
        const expanded = open.includes(section.id)
        const contentId = `panel-${section.id}`
        const Chevron = expanded ? ChevronUpIcon : ChevronDownIcon
        return (
          <div key={section.id} className="flex flex-col">
            <h2>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={() => toggle(section.id)}
                className="flex h-11 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
              >
                <section.icon
                  className={cn("size-3.5 shrink-0", !expanded && "text-muted-foreground")}
                />
                {section.label}
                <Chevron className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </h2>
            {expanded ? (
              <div id={contentId} className="flex flex-col gap-3 px-3.5 pt-3 pb-4 text-[13px]">
                {section.content}
              </div>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
