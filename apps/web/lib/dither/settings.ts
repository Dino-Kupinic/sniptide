// Shared by charts, meters and status artwork. One CSS pixel is the finest cell.
export const ditherSettings = { fill: "hatched", cell: 1, bloom: "off" } as const

// The large status codes on the 404 and 500 pages. At one pixel per cell the hatching blurs into
// hairlines and the lit edge reads as a solid cap, so the codes use 3px cells with a gradient face
// that is densest at the top, which keeps the digits legible as pixel art at every size.
export const codeDitherSettings = { ...ditherSettings, fill: "gradient", cell: 3 } as const
