import { cn } from "cn"

// The success mark: a check that draws itself in. Reduced motion shows it fully drawn at once.
function SuccessCheck({ className, ...props }: Omit<React.ComponentProps<"svg">, "children">) {
  return (
    <svg
      data-slot="success-check"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M4.5 12.5 9.5 17.5 19.5 6.5"
        pathLength={1}
        className="animate-[check-draw_300ms_ease-out_both] [stroke-dasharray:1] motion-reduce:animate-none motion-reduce:[stroke-dashoffset:0]"
      />
    </svg>
  )
}

export { SuccessCheck }
