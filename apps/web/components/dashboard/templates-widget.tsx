"use client"

import { cn } from "@sniptide/ui/lib/utils"
import Link from "next/link"
import type * as React from "react"
import { track } from "@/lib/analytics"
import type { WidgetSize } from "@/lib/dashboard/widgets"
import type { TemplateSummary, TemplateVisual } from "@/lib/pastes/templates"

// How many templates each size lists: two rows of three when large, two rows of two when small.
// A single column, as on a phone, stops after three so the widgets below stay in reach.
const SHOWN: Record<WidgetSize, number> = { large: 6, small: 4 }
const SINGLE_COLUMN = 3

// Logos share one height, so wordmarks of different widths read as peers. The artwork is a mask
// filled with the text color, so it follows light and dark like the app's other icons.
const LOGO_HEIGHT = 16

function Visual({ visual }: { visual: TemplateVisual }) {
  if (visual.kind === "logo") {
    const style: React.CSSProperties = {
      width: LOGO_HEIGHT * visual.ratio,
      height: LOGO_HEIGHT,
      maskImage: `url("${visual.src}")`,
      maskSize: "contain",
      maskRepeat: "no-repeat",
      maskPosition: "left center",
    }
    return <span aria-hidden className="block max-w-full shrink-0 bg-foreground" style={style} />
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <img src={visual.src} alt="" width={16} height={16} className="size-4 shrink-0" />
      <span className="truncate text-[13px] leading-4 font-semibold">{visual.mark}</span>
    </span>
  )
}

// The first templates from the website as a grid of cells. Each opens the editor filled with the
// template's files, and the person saves an ordinary paste of their own. Cells sit on hairlines
// inside the widget's frame rather than as cards of their own.
export function TemplatesGrid({
  templates,
  size,
}: {
  templates: TemplateSummary[]
  size: WidgetSize
}) {
  return (
    <ul className="grid grid-cols-1 gap-px bg-border @xl/widget:grid-cols-2 @4xl/widget:grid-cols-3">
      {templates.slice(0, SHOWN[size]).map((template, index) => (
        <li
          key={template.name}
          className={cn(
            "relative flex min-w-0 flex-col gap-1.5 bg-background px-4 pt-3.5 pb-4 hover:bg-muted/50",
            index >= SINGLE_COLUMN && "@max-xl/widget:hidden",
          )}
        >
          <div className="mb-1 flex h-5 min-w-0 items-center text-foreground">
            {template.visual ? <Visual visual={template.visual} /> : null}
          </div>
          <Link
            href={`/new?template=${encodeURIComponent(template.name)}`}
            onClick={() => track("dashboard_template_opened", { template: template.name })}
            className="min-w-0 truncate text-sm leading-5 font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {template.title}
          </Link>
          <p className="line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">
            {template.description}
          </p>
          <p className="mt-auto truncate pt-1.5 font-mono text-xs leading-4 text-muted-foreground">
            {template.files.map((file) => (
              <span key={file} className="mr-3 last:mr-0">
                {file}
              </span>
            ))}
          </p>
        </li>
      ))}
    </ul>
  )
}
