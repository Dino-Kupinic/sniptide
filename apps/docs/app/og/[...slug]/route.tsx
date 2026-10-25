import { notFound } from "next/navigation"
import { renderOgImage } from "@/lib/og"
import { source } from "@/lib/source"

// One image per docs page, generated at build time. /og/<page path>/image.png, and /og/image.png
// for the home page.
export const dynamicParams = false

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: [...page.slugs, "image.png"] }))
}

export async function GET(_request: Request, { params }: RouteContext<"/og/[...slug]">) {
  const { slug } = await params
  if (slug.at(-1) !== "image.png") notFound()
  const page = source.getPage(slug.slice(0, -1))
  if (!page) notFound()

  return renderOgImage({ title: page.data.title })
}
