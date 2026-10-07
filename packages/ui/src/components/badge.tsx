import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import type * as React from "react"

const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 px-2 text-[13px] leading-none font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        outline: "border border-foreground/80 text-foreground",
        solid: "bg-foreground text-background",
        primary: "bg-primary text-primary-foreground",
        muted: "border border-border text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
