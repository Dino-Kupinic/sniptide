import { DitherCode } from "@/components/dithercn/dither-code"
import { ditherSettings } from "@/lib/dither/settings"

export function Pixel404({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <DitherCode code="404" color="--primary" extrude={4} animate={false} {...ditherSettings} />
    </div>
  )
}
