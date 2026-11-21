"use client"

import { Reveal } from "@sniptide/ui/components/reveal"
import { Tooltip, TooltipContent, TooltipTrigger } from "@sniptide/ui/components/tooltip"
import { cn } from "@sniptide/ui/lib/utils"
import { ChevronDownIcon, ChevronLeftIcon, type LucideIcon, PanelRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
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
  // Why the section can't be used right now, such as an option that needs an account. A disabled
  // section stays in the list so people know it exists, and shows the reason in a tooltip.
  disabled?: string
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
  "rounded-lg inline-flex size-8 shrink-0 items-center justify-center text-foreground/75 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:bg-muted aria-pressed:text-foreground [&_svg]:size-4"

// Lives in the code card's bar, after a divider. Desktop only, like the panel.
export function SidePanelToggle() {
  const t = useTranslations("Paste")
  const { rail, setRail } = React.useContext(PanelContext)
  return (
    <>
      <span aria-hidden="true" className="mx-1.5 hidden h-4 w-px bg-border lg:block" />
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={rail ? t("showSidePanel") : t("hideSidePanel")}
          aria-expanded={!rail}
          onClick={() => setRail(!rail)}
          className={cn(panelToolClass, "hidden lg:inline-flex")}
        >
          <PanelRightIcon />
        </TooltipTrigger>
        <TooltipContent side="bottom">{rail ? t("showPanel") : t("hidePanel")}</TooltipContent>
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
  const t = useTranslations("Paste")
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
          "overflow-hidden rounded-lg hidden w-11 shrink-0 flex-col items-center border border-border lg:flex",
          className,
        )}
      >
        <button
          type="button"
          aria-label={t("showSidePanel")}
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
                aria-disabled={section.disabled ? true : undefined}
                onClick={() => {
                  if (section.disabled) return
                  setOpen((current) =>
                    current.includes(section.id) ? current : [...current, section.id],
                  )
                  setRail(false)
                }}
                className={cn(
                  panelToolClass,
                  "relative",
                  section.disabled && "cursor-default opacity-50 hover:bg-transparent",
                )}
              >
                <section.icon />
                {section.marked ? (
                  <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 bg-link" />
                ) : null}
              </TooltipTrigger>
              <TooltipContent side="left">{section.disabled ?? section.label}</TooltipContent>
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
        "overflow-hidden rounded-lg hidden w-[272px] shrink-0 flex-col divide-y divide-border border border-border lg:flex xl:w-[300px]",
        className,
      )}
    >
      {sections.map((section) => {
        if (section.disabled) return <DisabledSection key={section.id} section={section} />
        const expanded = open.includes(section.id)
        const contentId = `panel-${section.id}`
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
                <ChevronDownIcon
                  className={cn(
                    "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                    expanded && "rotate-180",
                  )}
                />
              </button>
            </h2>
            <Reveal
              open={expanded}
              id={contentId}
              className="flex flex-col gap-3 px-3.5 pt-3 pb-4 text-[13px]"
            >
              {section.content}
            </Reveal>
          </div>
        )
      })}
    </section>
  )
}

// A section that can't be opened: its row stays visible, dimmed, and names the reason on hover
// and focus.
function DisabledSection({ section }: { section: PanelSection }) {
  return (
    <h2>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-disabled
          aria-description={section.disabled}
          className="flex h-11 w-full cursor-default items-center gap-2.5 px-3.5 text-left text-[13px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
        >
          <section.icon className="size-3.5 shrink-0" />
          {section.label}
        </TooltipTrigger>
        <TooltipContent side="left">{section.disabled}</TooltipContent>
      </Tooltip>
    </h2>
  )
}
