import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"

const app = new URL("../", import.meta.url)
const require = createRequire(new URL("package.json", app))
const sharp = createRequire(require.resolve("next/package.json"))("sharp")
const logo = await readFile(new URL("../../packages/ui/src/components/logo.tsx", app), "utf8")
const polygons = [...logo.matchAll(/<polygon points="([^"]+)"/g)]

if (polygons.length !== 6) {
  throw new Error("Expected the six Paper brand mark polygons in LogoMark")
}

// The mark's corners stay within the maskable icon's central 80% safe circle.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#fff" />
  <svg x="22" y="23.022" width="56" height="53.956" viewBox="2 2 20 19.27" fill="#2A26EC">
${polygons.map(([, points]) => `    <polygon points="${points}" />`).join("\n")}
  </svg>
</svg>
`

await writeFile(new URL("app/icon0.svg", app), svg)

const images = [
  ["app/icon1.png", 96],
  ["app/apple-icon.png", 180],
  ["public/web-app-manifest-192x192.png", 192],
  ["public/web-app-manifest-512x512.png", 512],
]

for (const [path, size] of images) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(new URL(path, app).pathname)
}

const sizes = [16, 32, 48]
const frames = await Promise.all(
  sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()),
)
const directory = Buffer.alloc(6 + frames.length * 16)
directory.writeUInt16LE(1, 2)
directory.writeUInt16LE(frames.length, 4)
let imageOffset = directory.length

for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16
  directory.writeUInt8(sizes[index], entry)
  directory.writeUInt8(sizes[index], entry + 1)
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(frame.length, entry + 8)
  directory.writeUInt32LE(imageOffset, entry + 12)
  imageOffset += frame.length
}

await writeFile(new URL("app/favicon.ico", app), Buffer.concat([directory, ...frames]))
