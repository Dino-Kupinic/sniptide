"use client"

import { cn } from "@sniptide/ui/lib/utils"
import Link from "fumadocs-core/link"
import { useI18n } from "fumadocs-ui/contexts/i18n"
import { type HTMLAttributes, type ReactNode, useId } from "react"
import { localePath } from "@/lib/i18n"

// Illustrated entry points for an overview: a line drawing in the link blue on a dashed grid,
// with the title and one line below it. The drawings are isometric and built from the same few
// shapes, so they read as one set. They are decorative, so screen readers get the title and text.

export function FeatureCards({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("not-prose my-8 grid gap-x-6 gap-y-10 sm:grid-cols-2", className)}
    />
  )
}

type Art = "paste" | "agent" | "server" | "api"

export type FeatureCardProps = {
  art: Art
  title: ReactNode
  description: ReactNode
  href: string
}

export function FeatureCard({ art, title, description, href }: FeatureCardProps) {
  const { locale } = useI18n()
  return (
    <Link
      href={localePath(locale ?? "en", href)}
      className="group flex flex-col gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg border bg-[color-mix(in_oklab,var(--link)_5%,var(--card))] transition-colors group-hover:border-[color-mix(in_oklab,var(--link)_45%,var(--border))]">
        <Grid />
        <svg
          aria-hidden
          viewBox="32 18 256 144"
          className="absolute inset-0 size-full transition-transform duration-300 ease-out group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
          fill="none"
          stroke="var(--link)"
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {drawings[art]}
        </svg>
      </div>
      <div>
        <h3 className="font-heading text-lg leading-7 font-bold tracking-[-0.02em] text-foreground">
          {title}
        </h3>
        <p className="mt-1 text-[0.9375rem] leading-6 text-muted-foreground">{description}</p>
      </div>
    </Link>
  )
}

// A dashed 32px grid that fades towards the edges.
function Grid() {
  const id = useId()
  return (
    <svg aria-hidden className="absolute inset-0 size-full">
      <defs>
        <pattern
          id={`${id}-grid`}
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
          x="-1"
          y="-1"
        >
          <path
            d="M32 0V32M0 32H32"
            stroke="color-mix(in oklab, var(--link) 22%, transparent)"
            strokeDasharray="2 3"
          />
        </pattern>
        <radialGradient id={`${id}-fade`}>
          <stop offset="40%" stopColor="white" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`}>
          <rect width="100%" height="100%" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-grid)`} mask={`url(#${id}-mask)`} />
    </svg>
  )
}

// Fills for the faces of a box: the top lightest, the right side darkest, so light comes from the
// top left in every drawing.
const face = {
  top: "color-mix(in oklab, var(--link) 26%, var(--card))",
  left: "color-mix(in oklab, var(--link) 16%, var(--card))",
  right: "color-mix(in oklab, var(--link) 9%, var(--card))",
  flat: "color-mix(in oklab, var(--link) 12%, var(--card))",
}

const C = Math.cos(Math.PI / 6)
const S = 0.5
type Point = [number, number]
const pts = (points: Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")

// An isometric box whose top-back corner is at (x, y): w runs to the right, d to the left.
function Box({ x, y, w, d, h }: { x: number; y: number; w: number; d: number; h: number }) {
  const a: Point = [x, y]
  const b: Point = [x + w * C, y + w * S]
  const c: Point = [x + w * C - d * C, y + w * S + d * S]
  const e: Point = [x - d * C, y + d * S]
  const down = ([px, py]: Point): Point => [px, py + h]
  return (
    <g>
      <polygon points={pts([e, c, down(c), down(e)])} fill={face.left} />
      <polygon points={pts([c, b, down(b), down(c)])} fill={face.right} />
      <polygon points={pts([a, b, c, e])} fill={face.top} />
    </g>
  )
}

// A point on the front-left face of a box, u along its width (0 to 1 from the left corner) and v down
// its height, for lights and slots.
function onFrontFace(x: number, y: number, w: number, d: number, u: number, v: number): Point {
  return [x - d * C + u * w * C, y + d * S + u * w * S + v]
}

const drawings: Record<Art, ReactNode> = {
  // Two pastes, one behind the other, with lines of code on the front one.
  paste: (
    <g>
      <polygon points="118,44 214,44 230,60 230,132 118,132" fill={face.right} />
      <polygon points="96,58 192,58 208,74 208,146 96,146" fill={face.flat} />
      <polyline points="192,58 192,74 208,74" />
      <line x1="112" y1="84" x2="148" y2="84" />
      <line x1="120" y1="98" x2="176" y2="98" />
      <line x1="120" y1="112" x2="164" y2="112" />
      <line x1="112" y1="126" x2="134" y2="126" />
      <rect x="166" y="120" width="56" height="18" rx="3" fill="var(--link)" stroke="none" />
      <path d="M180 129h28M200 125l4 4-4 4" stroke="var(--card)" strokeWidth="1.5" />
    </g>
  ),
  // A terminal with a prompt, and a cursor pointing at it.
  agent: (
    <g>
      <rect x="92" y="40" width="136" height="96" rx="5" fill={face.flat} />
      <line x1="92" y1="58" x2="228" y2="58" />
      <circle cx="103" cy="49" r="2.5" fill="var(--link)" stroke="none" />
      <circle cx="112" cy="49" r="2.5" />
      <circle cx="121" cy="49" r="2.5" />
      <polyline points="108,78 118,86 108,94" strokeWidth="2" />
      <line x1="126" y1="94" x2="146" y2="94" strokeWidth="2" />
      <line x1="108" y1="112" x2="170" y2="112" opacity="0.5" />
      <line x1="108" y1="122" x2="150" y2="122" opacity="0.5" />
      <path
        d="M206 100l30 12-13 4-5 13z"
        fill="color-mix(in oklab, var(--link) 30%, var(--card))"
      />
    </g>
  ),
  // A stack of three servers with a status light on each, drawn bottom first so each box sits on
  // the one below.
  server: (
    <g>
      {[88, 64, 40].map((y) => {
        const [lx, ly] = onFrontFace(160, y, 48, 48, 0.74, 9)
        const [x1, y1] = onFrontFace(160, y, 48, 48, 0.18, 9)
        const [x2, y2] = onFrontFace(160, y, 48, 48, 0.52, 9)
        return (
          <g key={y}>
            <Box x={160} y={y} w={48} d={48} h={18} />
            <line x1={x1} y1={y1} x2={x2} y2={y2} />
            <circle cx={lx} cy={ly} r="2.5" fill="var(--link)" stroke="none" />
          </g>
        )
      })}
    </g>
  ),
  // A request in braces travelling to a box: the API.
  api: (
    <g>
      <rect x="64" y="62" width="88" height="56" rx="5" fill={face.flat} />
      <path d="M90 76c-6 0-6 4-6 8v4c0 3-2 2-4 2 2 0 4-1 4 2v4c0 4 0 8 6 8" strokeWidth="1.75" />
      <path d="M126 76c6 0 6 4 6 8v4c0 3 2 2 4 2-2 0-4-1-4 2v4c0 4 0 8-6 8" strokeWidth="1.75" />
      <line x1="98" y1="90" x2="118" y2="90" opacity="0.6" />
      <path d="M152 90h40" strokeDasharray="3 4" />
      <path d="M186 85l6 5-6 5" />
      <Box x={234} y={60} w={34} d={34} h={34} />
    </g>
  ),
}
