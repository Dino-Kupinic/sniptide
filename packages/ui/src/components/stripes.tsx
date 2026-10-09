import { cn } from "@sniptide/ui/lib/utils"

type Bar = [number, number, number?, number?]

// Barcode stripes from the Paper auth screens' brand panel (720×900 artboard units).
const ink: Bar[] = [
  [0, 1],
  [5, 2],
  [11, 3],
  [18, 4],
  [32, 36],
  [140, 1],
  [145, 2],
  [151, 3],
  [158, 4],
  [172, 72],
  [244, 1],
  [249, 2],
  [255, 3],
  [262, 4],
  [276, 1],
  [281, 2],
  [287, 3],
  [294, 4],
  [308, 1],
  [313, 2],
  [319, 3],
  [326, 4],
  [340, 48],
  [388, 16, 280, 620],
  [420, 36],
  [456, 1],
  [461, 2],
  [467, 3],
  [474, 4],
]

const accent: Bar[] = [
  [68, 72, 420, 480],
  [404, 16],
  [488, 24],
  [584, 48],
  [668, 48],
]

// Hairlines are the thin 1-4 unit bars, blocks the wide ones. Dark mode dims the hairlines and
// lightens the blocks the way the brand's inverse logo does.
const hairlines = ink.filter(([, width]) => width <= 4)
const blocks = ink.filter(([, width]) => width > 4)

function Bars({ bars, className }: { bars: Bar[]; className: string }) {
  return (
    <g className={className}>
      {bars.map(([x, width, y = 0, height = 900]) => (
        <rect key={x} x={x} y={y} width={width} height={height} />
      ))}
    </g>
  )
}

export function Stripes({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 900"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMinYMid slice"
      className={cn("absolute", className)}
    >
      <Bars bars={hairlines} className="fill-logo-hatch" />
      <Bars bars={blocks} className="fill-logo-ink" />
      <Bars bars={accent} className="fill-primary" />
    </svg>
  )
}
