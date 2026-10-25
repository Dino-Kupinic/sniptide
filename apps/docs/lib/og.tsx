import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { markStripes, wordmarkPath } from "@sniptide/ui/lib/logo-paths"
import { ImageResponse } from "next/og"
import { tide } from "@/lib/og-tide"
import { siteName } from "@/lib/site"

export const ogSize = { width: 1200, height: 630 }

// The pink field card from the Paper file (Brand, "OG v2 · B · Pink field"): the brand pink with the
// logo and the title in pink ink and a Tide blue pixel tide along the bottom. It sets the docs apart
// from the blue card of the marketing site. The image renders outside the page, so the colors are
// the brand values rather than the theme variables.
const pink = "#f6a9d3"
// Pink ink on pink clears 9.9:1.
const pinkInk = "#2b0a1f"
const blue = "#2a26ec"

async function font(file: string) {
  return readFile(join(process.cwd(), "assets/fonts", file))
}

// The 1200 by 630 card for one docs page: the logo and the page title above the tide. The page
// description travels in the preview text, so the card leaves it out. Pages are rendered once at
// build time.
export async function renderOgImage({ title }: { title: string }) {
  const heading = await font("Archivo-500.woff")

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 96,
        padding: 64,
        background: pink,
        color: pinkInk,
      }}
    >
      <svg
        width={ogSize.width}
        height={ogSize.height}
        viewBox={`0 0 ${ogSize.width} ${ogSize.height}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <path fill={blue} d={tide} />
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <svg width={33} height={32} viewBox="2 2 20 19.27" role="img" aria-label={siteName}>
          <g fill={pinkInk}>
            {markStripes.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </g>
        </svg>
        <svg width={148} height={23} viewBox="1341 238 4340 683" role="img" aria-label={siteName}>
          <g transform="translate(0,1080) scale(0.1,-0.1)" fill={pinkInk}>
            <path d={wordmarkPath} />
          </g>
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          fontFamily: "Archivo",
          // One size for every page. Today's titles take two lines at most, which stay above the
          // tide.
          fontSize: 96,
          lineHeight: 0.96,
          letterSpacing: -3.5,
          width: 900,
        }}
      >
        {title}
      </div>
    </div>,
    {
      ...ogSize,
      fonts: [{ name: "Archivo", data: heading, style: "normal", weight: 500 }],
    },
  )
}
