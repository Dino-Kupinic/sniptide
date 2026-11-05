"use client"

import { cn } from "@sniptide/ui/lib/utils"
import { useEffect, useRef } from "react"
import { drawHorizon } from "@/lib/horizon"

// The marketing hero's pixel horizon (sniptide-web components/pixel-canvas.tsx): a low-resolution
// canvas scaled up without smoothing, a day seascape in light mode and a pink dusk in dark mode.
// It only animates while on screen, and draws one still frame under reduced motion.
export function PixelHorizon({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    const off = document.createElement("canvas")
    const offCtx = off.getContext("2d")
    if (!offCtx) return

    let image: ImageData | null = null
    let width = 0
    let height = 0
    let visible = true
    let frame = 0
    const start = performance.now()

    function render(now: number) {
      if (!ctx || !offCtx || width === 0) return
      const mobile = width < 640
      const cell = mobile ? 3 : 4
      const W = Math.ceil(width / cell)
      const H = Math.ceil(height / cell)
      if (!image || image.width !== W || image.height !== H) {
        off.width = W
        off.height = H
        image = offCtx.createImageData(W, H)
      }
      // The study starts six seconds in, so the first frame already has movement in it.
      const t = reduce ? 6 : (now - start) / 1000 + 6
      const night = document.documentElement.classList.contains("dark")
      drawHorizon(image, t, night ? "night" : "day", mobile)
      offCtx.putImageData(image, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(off, 0, 0, W * cell, H * cell)
    }

    function resize() {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      render(performance.now())
    }

    function loop(now: number) {
      if (visible) render(now)
      frame = requestAnimationFrame(loop)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
    })
    visibility.observe(canvas)
    // Redraw when the colour scheme flips, which matters for the still frame.
    const theme = new MutationObserver(() => render(performance.now()))
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    resize()
    if (!reduce) frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibility.disconnect()
      theme.disconnect()
    }
  }, [])

  return (
    <div aria-hidden="true" className={cn("pointer-events-none", className)}>
      <canvas ref={ref} className="block size-full [image-rendering:pixelated]" />
    </div>
  )
}
