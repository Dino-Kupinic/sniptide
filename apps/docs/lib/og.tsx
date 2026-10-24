import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { siteName } from "@/lib/site"

export const ogSize = { width: 1200, height: 630 }

// The brand colors: ink, graphite and the Tide blue of the logo mark.
const ink = "#1b1919"
const graphite = "#6b6b6b"
const blue = "#2a26ec"

// The six bars of the logo mark, from packages/ui/src/components/logo.tsx.
const bars = [
  "2,2.56 22,2.00 22,2.74 2,2.74",
  "2,4.59 22,3.48 22,4.96 2,4.96",
  "2,7.37 22,5.70 22,7.92 2,7.92",
  "2,10.89 22,8.66 22,11.63 2,11.63",
  "2,15.15 22,12.36 22,16.08 2,16.08",
  "2,20.15 22,16.81 22,21.27 2,21.27",
]

async function font(file: string) {
  return readFile(join(process.cwd(), "assets/fonts", file))
}

// Link previews show two lines of body text at most, so a long description is cut at a word.
export function clip(text: string, max = 150) {
  if (text.length <= max) return text
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`
}

// The 1200 by 630 card for one docs page: the logo mark and name, the page title in the heading font
// and its description. Pages are rendered once at build time.
export async function renderOgImage({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  const [heading, body] = await Promise.all([font("Archivo-700.woff"), font("Inter-400.woff")])

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "#ffffff",
        color: ink,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width={54} height={52} viewBox="2 2 20 19.27" role="img" aria-label="Sniptide">
          <g fill={blue}>
            {bars.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </g>
        </svg>
        <div style={{ fontFamily: "Archivo", fontSize: 36, letterSpacing: -0.7 }}>{siteName}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            fontFamily: "Archivo",
            fontSize: title.length > 28 ? 84 : 104,
            lineHeight: 1.04,
            letterSpacing: -3,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            style={{
              fontFamily: "Inter",
              fontSize: 32,
              lineHeight: 1.4,
              color: graphite,
              maxWidth: 940,
            }}
          >
            {clip(description)}
          </div>
        ) : null}
      </div>

      <div style={{ fontFamily: "Inter", fontSize: 26, color: graphite }}>docs.sniptide.com</div>
    </div>,
    {
      ...ogSize,
      fonts: [
        { name: "Archivo", data: heading, style: "normal", weight: 700 },
        { name: "Inter", data: body, style: "normal", weight: 400 },
      ],
    },
  )
}
