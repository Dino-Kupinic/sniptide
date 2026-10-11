// Axis maths for the views chart: a y axis with four even steps that reaches the biggest bar, and
// the x labels worth showing without crowding.

const INTERVALS = 4

export function niceScale(max: number) {
  if (max <= 0) return { max: INTERVALS, ticks: [0, 1, 2, 3, 4] }

  const magnitude = 10 ** Math.floor(Math.log10(max / INTERVALS))
  const step =
    [1, 2, 2.5, 5, 10]
      .map((multiple) => Math.max(1, multiple * magnitude))
      // Counts are whole numbers, so 2.5 is only a step at 25 and up.
      .filter(Number.isInteger)
      .find((candidate) => candidate * INTERVALS >= max) ?? max
  return {
    max: step * INTERVALS,
    ticks: Array.from({ length: INTERVALS + 1 }, (_, index) => index * step),
  }
}

// 750, 1k, 1.25k, 10k.
export function formatTick(value: number) {
  return value >= 1000 ? `${+(value / 1000).toFixed(2)}k` : String(value)
}

// Which bars get an x label: every few bars, plus the peak and the last one. A label too close to
// the peak or the end is dropped so none of them touch.
export function labelIndexes(count: number, peak: number) {
  if (count === 0) return new Set<number>()

  const every = count <= 7 ? 1 : count <= 24 ? 6 : count <= 30 ? 7 : 14
  const gap = Math.max(1, Math.ceil(count / 10))
  const last = count - 1

  const forced = peak >= 0 && last - peak >= gap ? [peak, last] : peak >= 0 ? [peak] : [last]
  const labels = new Set(forced)
  for (let index = 0; index < count; index += every) {
    if (forced.every((other) => Math.abs(other - index) >= gap)) labels.add(index)
  }
  return labels
}
