import type { Metadata } from "next"
import { getLanguage } from "./languages"

export interface PastePreview {
  slug: string
  title: string
  name: string
  language: string
  content: string
}

// Bound work before splitting: even a huge single line produces a small card.
export function previewLines(content: string) {
  return content
    .slice(0, 4000)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, 10)
    .map((line) => line.replace(/\t/g, "  ").slice(0, 88))
}

export function previewMetadata(preview: PastePreview, origin: string): Metadata {
  const url = `${origin}/${encodeURIComponent(preview.slug)}`
  const title = `${preview.title} · Sniptide`
  const description = `${getLanguage(preview.language).name} · ${preview.name} · Shared with Sniptide`
  const image = {
    url: `${url}/preview`,
    width: 1200,
    height: 630,
    alt: `Code preview of ${preview.title}`,
  }
  return {
    title,
    description,
    openGraph: { type: "website", siteName: "Sniptide", title, description, url, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}
