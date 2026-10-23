import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { markStripes, wordmarkPath } from "@sniptide/ui/lib/logo-shapes"
import { ImageResponse } from "next/og"
import { getLanguage } from "@/lib/pastes/languages"
import { type PastePreview, previewLines } from "@/lib/pastes/preview"

// The blue campaign card from the Paper brand page. The image renders outside the page, so the
// colors are the brand values rather than the theme variables: Tide blue, white, and the ink and
// graphite of the dark code block.
const blue = "#2A26EC"
const white = "#FFFFFF"
const ink = "#0A0A0A"
const graphite = "#A3A3A3"
const lineNumber = "#6B6B6B"

// next/og needs the font files themselves. Both are the latin subsets from Google Fonts (SIL Open
// Font License 1.1); other scripts fall back to the default font of next/og.
async function font(file: string) {
  return readFile(join(process.cwd(), "assets/fonts", file))
}

// The 1200 by 630 card that chat apps and social sites show for a public paste: the logo, the
// paste title and the first lines of its first file.
export async function pastePreviewImage(preview: PastePreview) {
  const [heading, mono] = await Promise.all([
    font("Archivo-500.woff"),
    font("JetBrainsMono-400.woff"),
  ])

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 40,
        width: "100%",
        height: "100%",
        // The code block runs off the bottom edge, like a file too long for the card.
        padding: "64px 64px 0",
        background: blue,
        color: white,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <svg width={33} height={32} viewBox="2 2 20 19.27" role="img" aria-label="Sniptide">
          <g fill={white}>
            {markStripes.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </g>
        </svg>
        <svg width={148} height={23} viewBox="1341 238 4340 683" role="img" aria-label="Sniptide">
          <g transform="translate(0,1080) scale(0.1,-0.1)" fill={white}>
            <path d={wordmarkPath} />
          </g>
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          fontFamily: "Archivo",
          fontSize: 64,
          lineHeight: 1.1,
          letterSpacing: -2.4,
          height: 70,
          overflow: "hidden",
        }}
      >
        {preview.title.slice(0, 60)}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
          padding: "24px 32px 0",
          background: ink,
          fontFamily: "JetBrains Mono",
          fontSize: 22,
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: "flex", flexShrink: 0, paddingBottom: 14, color: graphite }}>
          {`${preview.name.slice(0, 60)} · ${getLanguage(preview.language).name}`}
        </div>
        {previewLines(preview.content).map((line, index) => (
          // The numbered lines keep their identity even when their text is duplicated.
          <div key={`${index}-${line}`} style={{ display: "flex", flexShrink: 0, whiteSpace: "pre" }}>
            <span style={{ display: "flex", width: 48, flexShrink: 0, color: lineNumber }}>
              {index + 1}
            </span>
            <span>{line || " "}</span>
          </div>
        ))}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "no-store" },
      fonts: [
        { name: "Archivo", data: heading, style: "normal", weight: 500 },
        { name: "JetBrains Mono", data: mono, style: "normal", weight: 400 },
      ],
    },
  )
}
