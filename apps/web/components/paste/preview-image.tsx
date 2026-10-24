import { readFile } from "node:fs/promises"
import path from "node:path"
import { markStripes, wordmarkPath } from "@sniptide/ui/lib/logo-paths"
import { ImageResponse } from "next/og"
import { highlightFiles } from "@/lib/highlight/highlight"
import type { HighlightRole } from "@/lib/highlight/types"
import { getLanguage } from "@/lib/pastes/languages"
import { type PastePreview, previewLines } from "@/lib/pastes/preview"
import { lifeCell, lifeCells } from "@/lib/pastes/preview-life"

export const previewSize = { width: 1200, height: 630 }

// The Night card from the brand file: the sidebar black with the logo, the paste title and its
// first lines of code in a panel that runs off the bottom edge, and the Game of Life in both
// gutters (lib/pastes/preview-life.ts) at its first generation. The preview video
// (lib/pastes/preview-video.ts) plays the gutters over this card's centre.
const colors = {
  background: "#0c0b0b",
  foreground: "#f4f4f4",
  muted: "#a3a3a3",
  panel: "#121111",
  border: "#2f2c2c",
  lineNumber: "#5c5858",
  trail: "#2a26ec",
  live: "#8f8cff",
}

// The dark --syntax-* colours from packages/ui globals.css.
const syntax: Record<HighlightRole, string> = {
  keyword: "#8f8cff",
  string: "#5fd3a8",
  constant: "#f5b971",
  function: "#c4b5fd",
  type: "#67d4e8",
  property: "#fb9fb1",
  comment: "#8a8a8a",
  punctuation: "#b0b0b0",
  heading: "#f4f4f4",
  link: "#8f8cff",
  invalid: "#ff6467",
}

const fontDir = path.join(process.cwd(), "assets/fonts")
let fonts: Promise<[Buffer, Buffer]> | undefined
function loadFonts() {
  fonts ??= Promise.all([
    readFile(path.join(fontDir, "Archivo-500.woff")),
    readFile(path.join(fontDir, "JetBrainsMono-Regular.ttf")),
  ])
  return fonts
}

// One path per opacity step keeps the SVG small: a few hundred cells share about twenty paths.
function lifePaths() {
  const layers = new Map<string, string>()
  const add = (color: string, alpha: number, d: string) => {
    const step = Math.round(alpha * 20) / 20
    if (step <= 0) return
    const key = `${color} ${step}`
    layers.set(key, (layers.get(key) ?? "") + d)
  }
  for (const cell of lifeCells(0)) {
    const d = `M${cell.x} ${cell.y}h${lifeCell - 1}v${lifeCell - 1}h-${lifeCell - 1}z`
    add(colors.trail, cell.trail, d)
    add(colors.live, cell.live, d)
  }
  // Trails first, so live cells sit on top.
  return [...layers].sort(
    ([a], [b]) => (a.startsWith(colors.trail) ? -1 : 0) - (b.startsWith(colors.trail) ? -1 : 0),
  )
}

// Satori can't ellipsize, so long titles are cut here; about 30 characters fill the line.
function oneLine(title: string) {
  const chars = [...title]
  return chars.length > 30 ? `${chars.slice(0, 29).join("").trimEnd()}…` : title
}

type Run = { text: string; color: string }

async function codeLines(preview: PastePreview): Promise<Run[][]> {
  const lines = previewLines(preview.content)
  const [file] = await highlightFiles([
    { name: preview.name, language: preview.language, content: lines.join("\n") },
  ])
  if (!file?.lines) return lines.map((text) => [{ text, color: colors.foreground }])
  return file.lines.map((tokens) =>
    tokens.map((token) =>
      typeof token === "string"
        ? { text: token, color: colors.foreground }
        : { text: token[0], color: syntax[token[1]] },
    ),
  )
}

export async function pastePreviewImage(preview: PastePreview) {
  const [[heading, mono], lines] = await Promise.all([loadFonts(), codeLines(preview)])
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: colors.background,
        color: colors.foreground,
        padding: "52px 168px 0",
        fontFamily: "JetBrains Mono",
      }}
    >
      <svg
        width={previewSize.width}
        height={previewSize.height}
        viewBox={`0 0 ${previewSize.width} ${previewSize.height}`}
        aria-hidden="true"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {lifePaths().map(([key, d]) => {
          const [color, opacity] = key.split(" ")
          return <path key={key} d={d} fill={color} fillOpacity={Number(opacity)} />
        })}
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <svg width={33} height={32} viewBox="2 2 20 19.27" aria-hidden="true">
          <g fill={colors.foreground}>
            {markStripes.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </g>
        </svg>
        <svg width={148} height={23} viewBox="1341 238 4340 683" aria-hidden="true">
          <g transform="translate(0,1080) scale(0.1,-0.1)" fill={colors.foreground}>
            <path d={wordmarkPath} />
          </g>
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 36,
          fontFamily: "Archivo",
          fontSize: 56,
          lineHeight: 1.07,
          letterSpacing: -2,
          // One line: the title is cut to about what fits, and anything wider is clipped.
          height: 60,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {oneLine(preview.title)}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          marginTop: 32,
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          // Taller than the space left, so the panel runs off the bottom of the card.
          height: 480,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "14px 24px",
            borderBottom: `1px solid ${colors.border}`,
            fontSize: 18,
            color: colors.muted,
          }}
        >
          <span>{preview.name}</span>
          <span>{getLanguage(preview.language).name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "18px 24px 0" }}>
          {lines.map((runs, index) => (
            // The numbered lines keep their identity even when their text is duplicated.
            <div
              key={`${index}-${runs.map((run) => run.text).join("")}`}
              style={{ display: "flex", fontSize: 20, height: 30, whiteSpace: "pre" }}
            >
              <span style={{ display: "flex", width: 40, flexShrink: 0, color: colors.lineNumber }}>
                {index + 1}
              </span>
              {runs.map((run, i) => (
                <span key={`${i}-${run.text}`} style={{ color: run.color }}>
                  {run.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    {
      ...previewSize,
      fonts: [
        { name: "Archivo", data: heading, style: "normal", weight: 500 },
        { name: "JetBrains Mono", data: mono, style: "normal", weight: 400 },
      ],
      headers: { "Cache-Control": "no-store" },
    },
  )
}
