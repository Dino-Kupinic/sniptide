import type { Metadata } from "next"
import { getLanguage } from "./languages"

export interface PastePreview {
  slug: string
  title: string
  name: string
  language: string
  content: string
  // Unlisted pastes unfurl like public ones but stay out of search engines.
  unlisted?: boolean
}

// Bound work before splitting: even a huge single line produces a small card.
export function previewLines(content: string) {
  return content
    .slice(0, 4000)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, 12)
    .map((line) => line.replace(/\t/g, "  ").slice(0, 88))
}

// With `video`, the card also comes as og:video (lib/pastes/preview-video.ts); the image stays as
// the fallback for the many sites that only show images.
export function previewMetadata(
  preview: PastePreview,
  origin: string,
  { video = false }: { video?: boolean } = {},
): Metadata {
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
    ...(preview.unlisted && { robots: { index: false, follow: false } }),
    openGraph: {
      type: "website",
      siteName: "Sniptide",
      title,
      description,
      url,
      images: [image],
      ...(video && {
        videos: [
          {
            url: `${url}/preview.mp4`,
            ...(url.startsWith("https:") && { secureUrl: `${url}/preview.mp4` }),
            type: "video/mp4",
            width: 1200,
            height: 630,
          },
        ],
      }),
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}
