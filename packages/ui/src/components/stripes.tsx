import { cn } from "@sniptide/ui/lib/utils"

// Barcode stripes from the Paper auth screens' brand panel (720×900 artboard units).
const ink: [number, number, number?, number?][] = [
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

const accent: [number, number, number?, number?][] = [
  [68, 72, 420, 480],
  [404, 16],
  [488, 24],
  [584, 48],
  [668, 48],
]

export function Stripes({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 900"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      preserveAspectRatio="xMinYMid slice"
      className={cn("absolute", className)}
    >
      <g className="fill-foreground">
        {ink.map(([x, width, y = 0, height = 900]) => (
          <rect key={x} x={x} y={y} width={width} height={height} />
        ))}
      </g>
      <g className="fill-primary">
        {accent.map(([x, width, y = 0, height = 900]) => (
          <rect key={x} x={x} y={y} width={width} height={height} />
        ))}
      </g>
    </svg>
  )
}
