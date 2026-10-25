// Renders the Game of Life gutters of the paste preview card (lib/pastes/preview-life.ts) to
// assets/preview/life.mp4: one seamless 16 second loop on the card's background. The preview video
// of each paste lays its still card's centre over this loop, so the loop is rendered once here and
// committed. Run it after changing the Game of Life, with ffmpeg installed:
//
//   bun scripts/render-preview-life.ts

import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import {
  generationsPerSecond,
  lifeCell,
  lifeCells,
  lifeColors,
  loopSeconds,
} from "../lib/pastes/preview-life"

const width = 1200
const height = 630
const fps = 30
const output = path.join(import.meta.dirname, "../assets/preview/life.mp4")

await mkdir(path.dirname(output), { recursive: true })
const ffmpeg = spawn(
  "ffmpeg",
  [
    ...["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24"],
    ...["-s", `${width}x${height}`, "-r", String(fps), "-i", "-"],
    ...["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "animation"],
    ...["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output],
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
)

const background = Buffer.alloc(width * height * 3)
for (let p = 0; p < width * height; p++) background.set(lifeColors.background, p * 3)

function paint(frame: Buffer, x: number, y: number, color: readonly number[], alpha: number) {
  if (alpha <= 0) return
  // Each cell leaves a 1px gap to its neighbours, like the still card.
  for (let dy = 0; dy < lifeCell - 1; dy++) {
    for (let dx = 0; dx < lifeCell - 1; dx++) {
      const offset = ((y + dy) * width + x + dx) * 3
      for (let c = 0; c < 3; c++) {
        const under = frame[offset + c] as number
        frame[offset + c] = Math.round(under + ((color[c] as number) - under) * alpha)
      }
    }
  }
}

const frames = Math.round(loopSeconds * fps)
for (let i = 0; i < frames; i++) {
  const frame = Buffer.from(background)
  for (const cell of lifeCells((i / fps) * generationsPerSecond)) {
    paint(frame, cell.x, cell.y, lifeColors.trail, cell.trail)
    paint(frame, cell.x, cell.y, lifeColors.live, cell.live)
  }
  if (!ffmpeg.stdin.write(frame))
    await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve))
}
ffmpeg.stdin.end()
const code = await new Promise((resolve) => ffmpeg.on("close", resolve))
if (code !== 0) throw new Error(`ffmpeg exited with ${code}`)
console.log(`Wrote ${path.relative(process.cwd(), output)}`)
