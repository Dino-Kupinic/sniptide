"use client"

import { launchConfetti } from "@sniptide/ui/lib/confetti"
import { markStripes, wordmarkPath } from "@sniptide/ui/lib/logo-shapes"
import { cn } from "@sniptide/ui/lib/utils"
import { useEffect, useId, useRef, useState } from "react"

const confettiClicks = 5
const confettiClickWindow = 1500

/**
 * The tide that flows through the logo on click: a band that starts below the
 * logo and travels past its top edge, clipped to the logo shapes. The
 * `logo-flow` keyframes translate by percentages of the SVG view box, so the
 * same band works for the mark and the wordmark.
 */
function LogoFlow({
  clipId,
  gradientId,
  x,
  y,
  width,
  height,
  onDone,
}: {
  clipId: string
  gradientId: string
  x: number
  y: number
  width: number
  height: number
  onDone: () => void
}) {
  return (
    <g clipPath={`url(#${clipId})`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            className="[stop-color:var(--link)] dark:[stop-color:var(--primary)]"
            stopOpacity="0"
          />
          <stop
            offset="0.45"
            className="[stop-color:var(--link)] dark:[stop-color:var(--primary)]"
          />
          <stop
            offset="0.75"
            className="[stop-color:color-mix(in_oklch,var(--link),white_55%)] dark:[stop-color:var(--link)]"
          />
          <stop
            offset="1"
            className="[stop-color:color-mix(in_oklch,var(--link),white_55%)] dark:[stop-color:var(--link)]"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height * 2}
        fill={`url(#${gradientId})`}
        className="animate-logo-flow motion-reduce:hidden"
        onAnimationEnd={onDone}
      />
    </g>
  )
}

const hoverGrow =
  "origin-left transition-transform duration-150 motion-reduce:transition-none [a:hover_&]:scale-[1.04] [a:focus-visible_&]:scale-[1.04]"

export function LogoMark({
  className,
  flowing = false,
  onFlowEnd = () => {},
}: {
  className?: string
  flowing?: boolean
  onFlowEnd?: () => void
}) {
  const id = useId().replace(/:/g, "")
  const clipId = `${id}-mark-clip`

  return (
    <svg
      viewBox="2 2 20 19.27"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("h-7 w-[29.05px] shrink-0 fill-[#2A26EC] dark:fill-white", className)}
    >
      {markStripes.map((points) => (
        <polygon key={points} points={points} />
      ))}
      {flowing ? (
        <>
          <clipPath id={clipId}>
            {markStripes.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </clipPath>
          <LogoFlow
            clipId={clipId}
            gradientId={`${id}-mark-gradient`}
            x={2}
            y={2}
            width={20}
            height={19.27}
            onDone={onFlowEnd}
          />
        </>
      ) : null}
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "")
  const [flowing, setFlowing] = useState(false)
  const wordmarkId = `${id}-wordmark`
  const clipId = `${id}-wordmark-clip`

  const ref = useRef<HTMLSpanElement>(null)

  // The effect belongs to a logo that links somewhere, so a logo shown as plain
  // branding stays still. The listener sits on the link so that keyboard
  // activation triggers it too. Reduced motion skips it entirely. Five clicks
  // in quick succession, each within a second and a half of the last, set off
  // confetti.
  useEffect(() => {
    const link = ref.current?.closest("a")
    if (!link) return
    let clicks = 0
    let lastClick = 0
    const startFlow = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      setFlowing(true)

      const now = performance.now()
      clicks = now - lastClick < confettiClickWindow ? clicks + 1 : 1
      lastClick = now
      if (clicks >= confettiClicks) {
        clicks = 0
        launchConfetti()
      }
    }
    link.addEventListener("click", startFlow)
    return () => link.removeEventListener("click", startFlow)
  }, [])

  return (
    <span
      ref={ref}
      role="img"
      aria-label="SNIPTIDE"
      className={cn("flex shrink-0 items-center gap-2", hoverGrow, className)}
    >
      <LogoMark flowing={flowing} onFlowEnd={() => setFlowing(false)} />
      <span className="shrink-0 pt-px">
        <svg
          viewBox="1341 238 4340 683"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="h-auto w-[130px] fill-[#0A0A0A] dark:fill-white"
        >
          <g transform="translate(0,1080) scale(0.1,-0.1)">
            <path id={wordmarkId} d={wordmarkPath} />
          </g>
          {flowing ? (
            <>
              <clipPath id={clipId}>
                <use href={`#${wordmarkId}`} transform="translate(0,1080) scale(0.1,-0.1)" />
              </clipPath>
              <LogoFlow
                clipId={clipId}
                gradientId={`${id}-wordmark-gradient`}
                x={1341}
                y={238}
                width={4340}
                height={683}
                onDone={() => {}}
              />
            </>
          ) : null}
        </svg>
      </span>
    </span>
  )
}
