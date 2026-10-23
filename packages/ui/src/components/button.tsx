import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { Spinner } from "@sniptide/ui/components/spinner"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Raised variants sit on a 2px edge in a darker shade (--depth) and are 2px shorter, so face
// and edge together are as tall as the size. Hover lifts the face 1px and a
// press pushes it down onto the edge. Popup triggers skip the press so their menu doesn't jump.
// The press lands in 60ms so even a quick click shows it, and the release springs back with a
// slight overshoot. Under reduced motion the states switch without moving. A disabled button sits
// down on its edge, so a greyed face never rests on a coloured edge.
const raised =
  "duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:duration-[60ms] active:ease-out motion-reduce:transition-colors shadow-[0_2px_0_0_var(--depth)] not-disabled:hover:-translate-y-px not-disabled:hover:shadow-[0_3px_0_0_var(--depth)] not-aria-[haspopup]:active:translate-y-[2px] not-aria-[haspopup]:active:shadow-none aria-expanded:translate-y-0 aria-expanded:shadow-[0_2px_0_0_var(--depth)] disabled:translate-y-[2px] disabled:shadow-none"
const flat = "active:not-aria-[haspopup]:translate-y-px"
const raisedVariants: ("default" | "inverted" | "outline" | "secondary" | "destructive")[] = [
  "default",
  "inverted",
  "outline",
  "secondary",
  "destructive",
]

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center rounded-lg justify-center border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-loading:[&_svg:not([data-slot=spinner])]:hidden",
  {
    variants: {
      variant: {
        default: [
          raised,
          "bg-primary text-primary-foreground [--depth:color-mix(in_oklch,var(--primary),black_38%)] hover:bg-[color-mix(in_oklch,var(--primary),white_8%)]",
        ],
        inverted: [
          raised,
          "bg-foreground text-background [--depth:color-mix(in_oklch,var(--foreground),var(--background)_55%)] dark:[--depth:color-mix(in_oklch,var(--foreground),black_45%)] hover:bg-foreground/90",
        ],
        outline: [
          raised,
          "border-border bg-background [--depth:var(--border)] dark:[--depth:color-mix(in_oklch,var(--border),var(--foreground)_22%)] hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-card dark:hover:bg-muted",
        ],
        secondary: [
          raised,
          "bg-secondary [--depth:color-mix(in_oklch,var(--secondary),var(--foreground)_14%)] text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ],
        ghost: [
          flat,
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        ],
        destructive: [
          raised,
          "bg-destructive/10 [--depth:color-mix(in_oklch,var(--destructive)_30%,transparent)] text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        ],
        link: [flat, "text-link underline-offset-4 hover:underline"],
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        // Touch size for the primary action in mobile bars and sheets.
        xl: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    // Raised variants are 2px shorter than their size, so face and edge together fill it.
    compoundVariants: [
      { variant: raisedVariants, size: "default", className: "h-[30px]" },
      { variant: raisedVariants, size: "xs", className: "h-[22px]" },
      { variant: raisedVariants, size: "sm", className: "h-[26px]" },
      { variant: raisedVariants, size: "lg", className: "h-[34px]" },
      { variant: raisedVariants, size: "xl", className: "h-[38px]" },
      { variant: raisedVariants, size: "icon", className: "h-[30px] w-8" },
      { variant: raisedVariants, size: "icon-xs", className: "h-[22px] w-6" },
      { variant: raisedVariants, size: "icon-sm", className: "h-[26px] w-7" },
      { variant: raisedVariants, size: "icon-lg", className: "h-[34px] w-9" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

// `loading` is the shared in-flight state: a spinner stands in for the button's icon, the button
// stays focused and ignores clicks, and screen readers hear aria-busy. Keep the label as it is, or
// swap it for a "Saving…" style one.
function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading ? "" : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      focusableWhenDisabled={loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
