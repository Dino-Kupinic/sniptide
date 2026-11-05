import { PixelHorizon } from "@/components/pixel-horizon"

// The overview opens on a strip of the pixel horizon, the brand's shared scene, cropped to a band
// above the title. The marketing hero sets its copy on the scene; the docs keep the title and
// description in the page's own type below it, so the strip stays a picture and the page starts
// as a reference.
export function DocsHero() {
  return (
    <div aria-hidden="true" className="relative mb-8 h-28 overflow-clip rounded-lg border md:h-36">
      <PixelHorizon className="absolute inset-x-0 top-[-130%] h-[300%]" />
    </div>
  )
}
