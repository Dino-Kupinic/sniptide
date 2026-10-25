import "server-only"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { envInteger } from "@workspace/db/config"
import { pastePreviewImage, previewSize } from "@/components/paste/preview-image"
import type { PastePreview } from "./preview"
import { lifeGutterWidth } from "./preview-life"

// The og:video of a public paste: its preview card with the Game of Life moving in the gutters.
// The loop of the gutters is the same for every paste (assets/preview/life.mp4, rendered by
// scripts/render-preview-life.ts), so a paste's video is that loop with the centre of its still
// card laid over it. ffmpeg does the overlay in a few seconds; the result is cached on disk per
// card content, so an edit makes a new video and an unchanged paste never renders twice.
//
// Without ffmpeg (or with PREVIEW_VIDEO=off) previews stay a still image and pages leave out
// og:video.

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg"
const lifeLoop = path.join(process.cwd(), "assets/preview/life.mp4")
const cacheDir = process.env.PREVIEW_VIDEO_DIR || path.join(tmpdir(), "sniptide-preview-videos")
// Bump when the card or the loop changes, so cached videos are rendered again.
const rendererVersion = "preview-video-v1"
const renderTimeout = 60_000

let available: Promise<boolean> | undefined

export function previewVideoAvailable() {
  available ??= (async () => {
    if (process.env.PREVIEW_VIDEO === "off") return false
    try {
      await stat(lifeLoop)
    } catch {
      return false
    }
    return new Promise<boolean>((resolve) => {
      const probe = spawn(ffmpeg, ["-version"], { stdio: "ignore" })
      probe.on("error", () => resolve(false))
      probe.on("close", (code) => resolve(code === 0))
    })
  })()
  return available
}

function cacheKey(preview: PastePreview) {
  const { slug, title, name, language, content } = preview
  return createHash("sha256")
    .update(JSON.stringify([rendererVersion, slug, title, name, language, content]))
    .digest("hex")
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] })
    let errors = ""
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-2000)
    })
    const timer = setTimeout(() => child.kill("SIGKILL"), renderTimeout)
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with ${code}: ${errors}`))
    })
  })
}

// Keeps the newest files once the cache holds more than PREVIEW_VIDEO_CACHE_FILES videos.
async function prune() {
  const limit = envInteger("PREVIEW_VIDEO_CACHE_FILES", 500, 1, 100_000)
  const names = (await readdir(cacheDir)).filter((name) => name.endsWith(".mp4"))
  if (names.length <= limit) return
  const files = await Promise.all(
    names.map(async (name) => {
      const file = path.join(cacheDir, name)
      return { file, time: (await stat(file).catch(() => null))?.mtimeMs ?? 0 }
    }),
  )
  files.sort((a, b) => a.time - b.time)
  await Promise.all(
    files.slice(0, files.length - limit).map(({ file }) => rm(file, { force: true })),
  )
}

async function render(preview: PastePreview, file: string) {
  await mkdir(cacheDir, { recursive: true })
  const id = `${path.basename(file, ".mp4")}-${process.pid}-${Date.now()}`
  const card = path.join(cacheDir, `${id}.png`)
  const partial = path.join(cacheDir, `${id}.part.mp4`)
  try {
    const image = await pastePreviewImage(preview)
    await writeFile(card, Buffer.from(await image.arrayBuffer()))
    // The card's centre, between the widest reach of the two gutters, covers the loop's centre.
    const width = previewSize.width - 2 * lifeGutterWidth
    await run([
      ...["-y", "-loglevel", "error", "-i", lifeLoop, "-i", card],
      "-filter_complex",
      `[1:v]crop=${width}:${previewSize.height}:${lifeGutterWidth}:0[centre];[0:v][centre]overlay=${lifeGutterWidth}:0,format=yuv420p`,
      ...["-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-tune", "animation"],
      ...["-movflags", "+faststart", "-an", "-f", "mp4", partial],
    ])
    await rename(partial, file)
  } finally {
    await Promise.all([rm(card, { force: true }), rm(partial, { force: true })])
  }
  await prune().catch(() => {})
}

const inFlight = new Map<string, Promise<string>>()
// One render at a time per process: each keeps a core busy for a few seconds.
let queue: Promise<unknown> = Promise.resolve()

// The path of the paste's video, rendering it first when it isn't cached. The caller must have
// read the preview through readPublicPreview, which only returns public and unlisted pastes
// without protection.
export async function previewVideoFile(preview: PastePreview): Promise<string> {
  const key = cacheKey(preview)
  const file = path.join(cacheDir, `${key}.mp4`)
  if (await stat(file).catch(() => null)) return file

  let pending = inFlight.get(key)
  if (!pending) {
    pending = queue.then(() => render(preview, file)).then(() => file)
    queue = pending.catch(() => {})
    inFlight.set(key, pending)
    pending.finally(() => inFlight.delete(key)).catch(() => {})
  }
  return pending
}

// Starts rendering in the background so the video is ready before a link unfurler asks for it.
export function warmPreviewVideo(preview: PastePreview) {
  previewVideoAvailable()
    .then((ok) => (ok ? previewVideoFile(preview) : undefined))
    .catch((error) => console.error(`Could not render the preview video of ${preview.slug}`, error))
}
