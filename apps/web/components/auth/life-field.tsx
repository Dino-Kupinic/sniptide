"use client"

import { cn } from "@sniptide/ui/lib/utils"
import * as React from "react"

// The Game of Life behind the auth screens' pitch card, from the "Night, pink with blue trails"
// preview loop: live cells in --pink, and the trails they leave fading through --primary. The
// field wraps at every edge, reseeds a patch when it runs low, and the pointer sows new cells as
// it moves. Under reduced motion it draws one generation and sowing only adds cells.

const cellSize = 8
const generationsPerSecond = 5
const decay = 0.55
const density = 0.3
const sparse = 0.04

export function LifeField({ className }: { className?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = ref.current
    const host = canvas?.parentElement
    const context = canvas?.getContext("2d")
    if (!canvas || !host || !context) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches

    let columns = 0
    let rows = 0
    let cells = new Uint8Array(0)
    let glow = new Float32Array(0)
    let previous = new Float32Array(0)
    let live = ""
    let trail = ""

    const index = (x: number, y: number) =>
      ((y + rows) % rows) * columns + ((x + columns) % columns)

    function sow(x0: number, y0: number, width: number, height: number, chance: number) {
      for (let y = y0; y < y0 + height; y++) {
        for (let x = x0; x < x0 + width; x++) {
          if (Math.random() >= chance) continue
          const k = index(x, y)
          cells[k] = 1
          glow[k] = 1
          previous[k] = 1
        }
      }
    }

    function step() {
      const next = new Uint8Array(cells.length)
      let population = 0
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          let neighbours = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx || dy) neighbours += cells[index(x + dx, y + dy)] ?? 0
            }
          }
          const k = y * columns + x
          const alive = neighbours === 3 || (cells[k] === 1 && neighbours === 2)
          next[k] = alive ? 1 : 0
          if (alive) population++
        }
      }
      cells = next
      previous = glow
      glow = glow.map((value, k) => (cells[k] ? 1 : value * decay))
      if (population < cells.length * sparse) {
        sow(Math.floor(Math.random() * columns), Math.floor(Math.random() * rows), 14, 14, density)
      }
    }

    function draw(progress: number) {
      if (!canvas || !context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (let k = 0; k < glow.length; k++) {
        const before = previous[k] ?? 0
        const value = before + ((glow[k] ?? 0) - before) * progress
        if (value < 0.03) continue
        const x = (k % columns) * cellSize
        const y = Math.floor(k / columns) * cellSize
        context.globalAlpha = Math.min(value, 0.7) * 0.85
        context.fillStyle = trail
        context.fillRect(x, y, cellSize - 1, cellSize - 1)
        const bright = Math.max(0, (value - 0.6) / 0.4) * 0.6
        if (bright > 0) {
          context.globalAlpha = bright
          context.fillStyle = live
          context.fillRect(x, y, cellSize - 1, cellSize - 1)
        }
      }
      context.globalAlpha = 1
    }

    function resize() {
      if (!canvas || !host || !context) return
      const { width, height } = host.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const style = getComputedStyle(canvas)
      live = style.getPropertyValue("--pink").trim()
      trail = style.getPropertyValue("--primary").trim()
      const nextColumns = Math.ceil(width / cellSize)
      const nextRows = Math.ceil(height / cellSize)
      if (nextColumns !== columns || nextRows !== rows) {
        columns = nextColumns
        rows = nextRows
        cells = new Uint8Array(columns * rows)
        glow = new Float32Array(cells.length)
        previous = new Float32Array(cells.length)
        sow(0, 0, columns, rows, density)
        // A few generations in, the soup has settled into recognisable shapes.
        for (let i = 0; i < 12; i++) step()
      }
      draw(1)
    }

    let last: number | undefined
    function onPointerMove(event: PointerEvent) {
      if (!canvas) return
      const box = canvas.getBoundingClientRect()
      const x = Math.floor((event.clientX - box.left) / cellSize)
      const y = Math.floor((event.clientY - box.top) / cellSize)
      if (x < 0 || y < 0 || x >= columns || y >= rows) return
      const key = index(x, y)
      if (key === last) return
      last = key
      sow(x - 1, y - 1, 3, 3, 0.55)
      if (reduce) draw(1)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    window.addEventListener("pointermove", onPointerMove)

    let frame = 0
    if (!reduce) {
      let elapsed = 0
      let before = performance.now()
      const tick = (now: number) => {
        // A hidden tab pauses requestAnimationFrame, so cap the catch-up after it returns.
        elapsed += Math.min(now - before, 250)
        before = now
        const interval = 1000 / generationsPerSecond
        while (elapsed >= interval) {
          step()
          elapsed -= interval
        }
        draw(elapsed / interval)
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("pointermove", onPointerMove)
    }
  }, [])

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      <canvas ref={ref} className="size-full" />
    </div>
  )
}
