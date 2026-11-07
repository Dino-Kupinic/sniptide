import { DitherCode } from "@/components/dithercn/dither-code"
import { codeDitherSettings } from "@/lib/dither/settings"

export function ErrorCode() {
  return (
    <div aria-hidden="true" className="mb-8 w-[302px] max-w-full sm:mb-10 sm:w-[536px]">
      <DitherCode
        code="500"
        color="--primary"
        extrude={4}
        animate={false}
        {...codeDitherSettings}
      />
    </div>
  )
}
