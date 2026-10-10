import { cn } from "@sniptide/ui/lib/utils"
import type * as React from "react"
import type { Hue, CollectionIcon as Icon } from "@/lib/collections/types"

// The abstract square icons collections wear, from the Collection icon picker frame in Paper.
// Each draws on a 16×16 grid in currentColor, so the hue is just the text color.
const shapes: Record<Icon, React.ReactNode> = {
  square: <rect x="2" y="2" width="12" height="12" />,
  outline: (
    <rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
  ),
  half: (
    <>
      <rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="2" y="2" width="6" height="12" />
    </>
  ),
  diagonal: (
    <>
      <rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <polygon points="2,2 14,2 2,14" />
    </>
  ),
  checker: (
    <>
      <rect x="2" y="2" width="6" height="6" />
      <rect x="8" y="8" width="6" height="6" />
    </>
  ),
  target: (
    <>
      <rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="6" width="4" height="4" />
    </>
  ),
  bars: (
    <>
      <rect x="2" y="2" width="12" height="4" />
      <rect x="2" y="10" width="12" height="4" />
    </>
  ),
  barcode: (
    <>
      <rect x="2" y="2" width="2" height="12" />
      <rect x="5.5" y="2" width="1" height="12" />
      <rect x="8" y="2" width="3" height="12" />
      <rect x="12.5" y="2" width="1.5" height="12" />
    </>
  ),
  steps: (
    <>
      <rect x="2" y="10" width="4" height="4" />
      <rect x="6" y="6" width="4" height="8" />
      <rect x="10" y="2" width="4" height="12" />
    </>
  ),
  grid: (
    <>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </>
  ),
  overlap: (
    <>
      <rect x="3" y="3" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="7" y="7" width="7" height="7" />
    </>
  ),
  corner: <path d="M2 2h12v4H6v8H2z" />,
}

// Ink and blue follow the theme (foreground and primary), so they hold up in dark mode.
export const hueClass: Record<Hue, string> = {
  ink: "text-foreground",
  blue: "text-primary",
  sky: "text-[#2E90FA]",
  teal: "text-[#0E9384]",
  green: "text-[#3E9B3E]",
  amber: "text-[#E0A100]",
  orange: "text-[#EF6820]",
  red: "text-[#D92D20]",
  pink: "text-[#DD2590]",
  violet: "text-[#7A5AF8]",
}

export const hueLabel: Record<Hue, string> = {
  ink: "Ink",
  blue: "Blue",
  sky: "Sky",
  teal: "Teal",
  green: "Green",
  amber: "Amber",
  orange: "Orange",
  red: "Red",
  pink: "Pink",
  violet: "Violet",
}

export function CollectionIcon({
  icon,
  hue,
  className,
}: {
  icon: Icon
  hue: Hue
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0", hueClass[hue], className)}
    >
      {shapes[icon]}
    </svg>
  )
}
