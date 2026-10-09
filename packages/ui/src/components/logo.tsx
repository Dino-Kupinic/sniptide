import { cn } from "@sniptide/ui/lib/utils"

// Sniptide mark from the Paper brand page. The logo-* tokens switch to the brand's inverse
// colors in dark mode.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 160"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <g className="fill-logo-ink">
        <rect x="0" y="0" width="80" height="32" />
        <rect x="43.6" y="96" width="80" height="32" />
        <rect x="123.6" y="128" width="36.4" height="32" />
      </g>
      <g className="fill-logo-hatch">
        <rect x="0" y="64" width="4" height="64" />
        <rect x="6" y="64" width="3" height="64" />
        <rect x="10" y="64" width="2" height="64" />
        <rect x="43.6" y="32" width="4" height="64" />
        <rect x="49" y="32" width="3" height="64" />
        <rect x="53" y="32" width="2" height="64" />
        <rect x="156" y="32" width="4" height="32" />
        <rect x="151" y="32" width="3" height="32" />
        <rect x="156" y="96" width="4" height="32" />
        <rect x="151" y="96" width="3" height="32" />
        <rect x="80" y="156" width="43.6" height="4" />
        <rect x="80" y="151" width="43.6" height="3" />
      </g>
      <g className="fill-primary">
        <rect x="80" y="0" width="80" height="32" />
        <rect x="0" y="32" width="36.4" height="32" />
        <rect x="80" y="64" width="80" height="32" />
        <rect x="0" y="128" width="80" height="32" />
      </g>
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-heading text-[25px] leading-7 font-bold tracking-[-0.01em]">
        SNIPTIDE
      </span>
    </span>
  )
}
