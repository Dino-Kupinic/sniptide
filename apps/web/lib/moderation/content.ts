// Turns a paste into what automated screening may send to a provider. Every part of the paste is
// covered (title, description, file names and file contents) and long text is split into chunks
// rather than cut, so nothing above the provider's input size goes unchecked.
//
// Images never leave the server. Data URIs and base64 runs that decode to an image are removed
// before anything is sent, so a known abuse image embedded in a paste is never uploaded to a
// third party. Other base64 runs that decode to readable text are screened as that text, within a
// fixed budget, and links are only extracted, never fetched.

export interface ScreenedPaste {
  title: string
  description: string
  files: { name: string; content: string }[]
}

export interface ScreeningInput {
  chunks: string[]
  urls: string[]
  imagesRemoved: number
}

// About 2,000 tokens per chunk, well below the providers' per-input limits.
const CHUNK_CHARS = 8_000
// Decoded base64 text screened per paste. Anything beyond it is still screened in its encoded
// form, which classifiers mostly read as noise.
const DECODED_BUDGET = 64 * 1024
const DATA_URI = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi
const BASE64_RUN = /[A-Za-z0-9+/]{200,}={0,2}/g
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`()[\]{}]+/gi

function isImage(bytes: Buffer) {
  const hex = bytes.subarray(0, 12).toString("hex")
  return (
    hex.startsWith("89504e47") || // PNG
    hex.startsWith("ffd8ff") || // JPEG
    hex.startsWith("47494638") || // GIF
    hex.startsWith("424d") || // BMP
    (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") || // WebP
    hex.slice(8, 16) === "66747970" // HEIC, AVIF and other ISO media
  )
}

function readable(text: string) {
  if (!text) return false
  let printable = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 0xfffd)) printable++
  }
  return printable / text.length > 0.95
}

// Removes embedded images and collects the text hidden in other base64 runs.
function stripImages(text: string) {
  let removed = 0
  const decoded: string[] = []
  const withoutUris = text.replace(DATA_URI, () => {
    removed++
    return "[image removed]"
  })
  const cleaned = withoutUris.replace(BASE64_RUN, (run) => {
    const bytes = Buffer.from(run, "base64")
    if (isImage(bytes)) {
      removed++
      return "[image removed]"
    }
    const asText = bytes.toString("utf8")
    if (readable(asText)) decoded.push(asText)
    return run
  })
  return { cleaned, removed, decoded }
}

export function chunk(text: string, size = CHUNK_CHARS) {
  const chunks: string[] = []
  for (let start = 0; start < text.length; start += size) {
    // Never split a surrogate pair, which would send an invalid character.
    let end = Math.min(start + size, text.length)
    const code = text.charCodeAt(end - 1)
    if (end < text.length && code >= 0xd800 && code <= 0xdbff) end--
    chunks.push(text.slice(start, end))
    start = end - size
  }
  return chunks
}

export function extractUrls(text: string) {
  const urls = new Set<string>()
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "")
    try {
      const url = new URL(raw)
      url.hash = ""
      urls.add(url.toString())
    } catch {
      // Not a URL after all.
    }
  }
  return [...urls]
}

export function screeningInput(paste: ScreenedPaste): ScreeningInput {
  let imagesRemoved = 0
  let budget = DECODED_BUDGET
  const parts: string[] = []
  const urls = new Set<string>()
  const add = (label: string, text: string) => {
    if (!text.trim()) return
    const { cleaned, removed, decoded } = stripImages(text)
    imagesRemoved += removed
    for (const url of extractUrls(cleaned)) urls.add(url)
    parts.push(`${label}:\n${cleaned}`)
    for (const hidden of decoded) {
      if (budget <= 0) break
      const slice = hidden.slice(0, budget)
      budget -= slice.length
      parts.push(`${label} (decoded base64):\n${slice}`)
      for (const url of extractUrls(slice)) urls.add(url)
    }
  }
  add("Title", paste.title)
  add("Description", paste.description)
  for (const file of paste.files) {
    add("File name", file.name)
    add(`File ${file.name}`, file.content)
  }
  return { chunks: parts.flatMap((part) => chunk(part)), urls: [...urls], imagesRemoved }
}
