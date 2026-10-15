import { cn } from "cn"

// The one loading indicator. Decorative by default (the control it sits in carries aria-busy or a
// status message); pass `label` where it stands alone. Reduced motion swaps the spin for a slow pulse.
function Spinner({
  className,
  label,
  ...props
}: Omit<React.ComponentProps<"svg">, "children"> & { label?: string }) {
  return (
    <svg
      data-slot="spinner"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "size-4 shrink-0 animate-spin motion-reduce:animate-[pulse_1.6s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  )
}

export { Spinner }
