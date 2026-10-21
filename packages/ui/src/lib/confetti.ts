/** Theme variables the pieces take their colors from, so they follow light and dark. */
const colorVariables = [
  "--primary",
  "--link",
  "--syntax-string",
  "--syntax-constant",
  "--syntax-function",
  "--syntax-property",
]

const pieceCount = 180
const maxDuration = 8000

type Piece = {
  x: number
  y: number
  size: number
  color: string
  fall: number
  sway: number
  swaySpeed: number
  phase: number
  rotation: number
  spin: number
}

/**
 * Pours square confetti down over the whole viewport from a fixed canvas that
 * ignores the pointer and removes itself once the last piece has fallen out of
 * view. Does nothing under prefers-reduced-motion.
 */
export function launchConfetti() {
  if (typeof window === "undefined") return
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return

  const width = window.innerWidth
  const height = window.innerHeight
  const ratio = window.devicePixelRatio || 1
  canvas.width = width * ratio
  canvas.height = height * ratio
  canvas.setAttribute("aria-hidden", "true")
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2147483647",
  })
  context.scale(ratio, ratio)
  document.body.append(canvas)

  const styles = getComputedStyle(document.documentElement)
  const colors = colorVariables.map((name) => styles.getPropertyValue(name).trim()).filter(Boolean)
  if (colors.length === 0) colors.push("currentColor")

  // Pieces start staggered above the top edge, so they pour in rather than
  // arriving as one sheet.
  const pieces: Piece[] = Array.from({ length: pieceCount }, () => ({
    x: Math.random() * width,
    y: -Math.random() * height * 0.5 - 20,
    size: 6 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)] ?? "currentColor",
    fall: 260 + Math.random() * 260,
    sway: 20 + Math.random() * 40,
    swaySpeed: 1.5 + Math.random() * 2.5,
    phase: Math.random() * Math.PI * 2,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 8,
  }))

  const start = performance.now()
  let previous = start

  const frame = (now: number) => {
    const delta = Math.min((now - previous) / 1000, 0.05)
    const elapsed = (now - start) / 1000
    previous = now

    context.clearRect(0, 0, width, height)
    let visible = 0
    for (const piece of pieces) {
      piece.y += piece.fall * delta
      piece.rotation += piece.spin * delta
      if (piece.y > height + piece.size) continue
      visible++

      const x = piece.x + Math.sin(elapsed * piece.swaySpeed + piece.phase) * piece.sway
      // Squashing one axis with the spin reads as a piece tumbling in 3D.
      const tumble = Math.cos(piece.rotation * 1.5)
      context.save()
      context.translate(x, piece.y)
      context.rotate(piece.rotation)
      context.scale(1, tumble)
      context.fillStyle = piece.color
      context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size)
      context.restore()
    }

    if (visible > 0 && now - start < maxDuration) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }

  requestAnimationFrame(frame)
}
