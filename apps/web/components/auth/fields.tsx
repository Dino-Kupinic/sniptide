import { cn } from "@sniptide/ui/lib/utils"

// Phone sizes come from the Paper mobile artboards (46px fields, 16px text so iOS doesn't zoom
// on focus); lg and up uses the 40px desktop fields.
export const authInputClass = "h-[46px] text-base lg:h-10 lg:text-sm"
export const authSubmitClass =
  "h-[50px] w-full text-base font-semibold lg:h-10 lg:text-sm lg:font-medium"

export { FormError } from "@sniptide/ui/components/form-error"

export function SwitchPrompt({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn("text-center text-sm text-muted-foreground lg:text-[13px]", className)}>
      {children}
    </p>
  )
}

export const inlineLinkClass =
  "font-medium text-foreground underline underline-offset-2 outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring/40"
