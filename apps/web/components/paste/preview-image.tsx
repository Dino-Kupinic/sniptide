import { ImageResponse } from "next/og"
import { getLanguage } from "@/lib/pastes/languages"
import { type PastePreview, previewLines } from "@/lib/pastes/preview"

export function pastePreviewImage(preview: PastePreview) {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#101110",
        color: "#f0f1e9",
        padding: 48,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", color: "#c7ed86", fontSize: 24 }}
      >
        <span>SNIPTIDE</span>
        <span>{getLanguage(preview.language).name}</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 42,
          fontWeight: 700,
          marginTop: 24,
          height: 60,
          overflow: "hidden",
        }}
      >
        {preview.title.slice(0, 80)}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#1b1d19",
          padding: 24,
          marginTop: 20,
          flex: 1,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", color: "#9da393", fontSize: 18, marginBottom: 18 }}>
          {preview.name}
        </div>
        {previewLines(preview.content).map((line, index) => (
          // The numbered lines keep their identity even when their text is duplicated.
          <div
            key={`${index}-${line}`}
            style={{ display: "flex", fontSize: 22, height: 28, whiteSpace: "pre" }}
          >
            <span style={{ display: "flex", width: 44, color: "#717765" }}>{index + 1}</span>
            <span>{line || " "}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 18, fontSize: 18, color: "#9da393" }}>
        Code worth sharing.
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "no-store" } },
  )
}
