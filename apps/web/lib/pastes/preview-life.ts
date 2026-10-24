// The Game of Life in the gutters of the paste preview card. Each gutter runs its own soup on a
// band that wraps at every edge, and every cell carries a glow: 1 while alive, fading by `decay`
// each generation after it dies. The loop is `loopLength` generations long, and its last
// `blend` generations fade into the ones just before its start, so the video repeats without a
// jump. Everything is seeded, so the still card (generation 0) and the video always agree.
//
// scripts/render-preview-life.ts renders the loop to assets/preview/life.mp4; run it after changing
// anything here.

export const lifeCell = 6
export const lifeColumns = 28
export const lifeRows = 105
export const loopLength = 128
export const generationsPerSecond = 8
export const loopSeconds = loopLength / generationsPerSecond

const warm = 36
const blend = 32
const decay = 0.55
const density = 0.32
// Seeds picked for soups that stay busy through the whole loop.
const soupSeeds = [19, 27]
const edgeSeeds = [7, 8]

// Live cells in Tide Light, fading trails in Tide blue (DESIGN.md, dark).
export const lifeColors = {
  background: [0x0c, 0x0b, 0x0b],
  live: [0x8f, 0x8c, 0xff],
  trail: [0x2a, 0x26, 0xec],
} as const

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function step(cells: Uint8Array) {
  const next = new Uint8Array(cells.length)
  for (let y = 0; y < lifeRows; y++) {
    for (let x = 0; x < lifeColumns; x++) {
      let neighbours = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const row = (y + dy + lifeRows) % lifeRows
          neighbours += cells[row * lifeColumns + ((x + dx + lifeColumns) % lifeColumns)] ?? 0
        }
      }
      const alive = cells[y * lifeColumns + x]
      next[y * lifeColumns + x] = neighbours === 3 || (alive && neighbours === 2) ? 1 : 0
    }
  }
  return next
}

// The glow of every cell for each generation of the loop.
function soup(seed: number) {
  const rand = mulberry32(seed)
  let cells = new Uint8Array(lifeColumns * lifeRows).map(() => (rand() < density ? 1 : 0))
  let glow = new Float32Array(cells.length)
  const history: Float32Array[] = []
  for (let i = 0; i < warm + loopLength; i++) {
    cells = step(cells)
    const alive = cells
    glow = glow.map((previous, k) => (alive[k] ? 1 : previous * decay))
    history.push(glow)
  }
  return Array.from({ length: loopLength }, (_, t) => {
    const current = history[warm + t] as Float32Array
    if (t < loopLength - blend) return current
    const before = history[warm + t - loopLength] as Float32Array
    const weight = (t - (loopLength - blend) + 1) / (blend + 1)
    return current.map((value, k) => value * (1 - weight) + (before[k] ?? 0) * weight)
  })
}

// How far each row of a gutter reaches in, counted in cells from the card's edge: runs of one to
// four rows share a width, so the field ends in uneven bars instead of a straight line.
function edges(seed: number) {
  const rand = mulberry32(seed)
  const widths: number[] = []
  while (widths.length < lifeRows) {
    const run = 1 + Math.floor(rand() * 4)
    const width = 13 + Math.floor(rand() * 15)
    for (let r = 0; r < run; r++) widths.push(width)
  }
  return widths.slice(0, lifeRows)
}

export interface LifeCell {
  // Left edge of the cell on the 1200 by 630 card.
  x: number
  y: number
  // Opacity of the trail colour and of the live colour drawn over it, 0 to 1.
  trail: number
  live: number
}

let gutters: { frames: Float32Array[]; edge: number[] }[] | undefined

function lifeGutters() {
  gutters ??= soupSeeds.map((seed, side) => ({
    frames: soup(seed),
    edge: edges(edgeSeeds[side] as number),
  }))
  return gutters
}

// The cells to draw at a moment of the loop, in generations; between whole generations each
// cell's glow is interpolated, so the field moves smoothly.
export function lifeCells(time: number): LifeCell[] {
  const whole = Math.floor(time)
  const i = ((whole % loopLength) + loopLength) % loopLength
  const j = (i + 1) % loopLength
  const f = time - whole
  const out: LifeCell[] = []
  lifeGutters().forEach(({ frames, edge }, side) => {
    const a = frames[i] as Float32Array
    const b = frames[j] as Float32Array
    for (let k = 0; k < a.length; k++) {
      const column = k % lifeColumns
      const row = Math.floor(k / lifeColumns)
      if (column >= (edge[row] as number)) continue
      const glow = (a[k] as number) + ((b[k] as number) - (a[k] as number)) * f
      if (glow < 0.03) continue
      out.push({
        x: side === 0 ? column * lifeCell : 1200 - (column + 1) * lifeCell,
        y: row * lifeCell,
        trail: Math.min(glow, 0.7) * 0.85,
        live: Math.max(0, (glow - 0.6) / 0.4) * 0.7,
      })
    }
  })
  return out
}

// The widest a gutter reaches, in pixels; the card keeps its content inside this.
export const lifeGutterWidth = 27 * lifeCell
