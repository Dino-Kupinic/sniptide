import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"
import { previewVideoAvailable, previewVideoFile } from "@/lib/pastes/preview-video"
import { readPublicPreview } from "@/lib/pastes/store"

export const dynamic = "force-dynamic"

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })

// The og:video of a public paste (lib/pastes/preview-video.ts). Players and unfurlers ask for byte
// ranges, so a single range is answered with 206.
export async function GET(request: Request, { params }: RouteContext<"/[slug]/preview.mp4">) {
  const preview = await readPublicPreview((await params).slug)
  if (!preview || !(await previewVideoAvailable())) return notFound()

  let file: string
  try {
    file = await previewVideoFile(preview)
  } catch (error) {
    console.error(`Could not render the preview video of ${preview.slug}`, error)
    return notFound()
  }
  const { size } = await stat(file)
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    // Short, like the page: a paste can turn private or change at any time.
    "Cache-Control": "public, max-age=300",
  })

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "")
  let start = 0
  let end = size - 1
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1])
      if (range[2]) end = Math.min(Number(range[2]), size - 1)
    } else {
      start = Math.max(0, size - Number(range[2]))
    }
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`)
      return new Response(null, { status: 416, headers })
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`)
  }
  headers.set("Content-Length", String(end - start + 1))
  const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream
  return new Response(body, { status: range && (range[1] || range[2]) ? 206 : 200, headers })
}
