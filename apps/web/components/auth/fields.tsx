import { cn } from "@sniptide/ui/lib/utils"

// Fields and buttons are 40px everywhere (buttons use size="xl"). Phones get 16px text so iOS
// doesn't zoom on focus.
export const authInputClass = "h-10 text-base lg:text-sm"
export const authSubmitClass = "w-full"

export { FormError } from "@sniptide/ui/components/form-error"

export function SwitchPrompt({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <p className={cn("text-center text-sm text-muted-foreground", className)}>{children}</p>
}

export const inlineLinkClass =
  "font-medium text-foreground underline underline-offset-2 outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring/40"
