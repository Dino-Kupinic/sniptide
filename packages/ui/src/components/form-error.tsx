import { cn } from "cn"

// The one error message. `banner` is the boxed message at the top of a form or page, `inline` the
// plain line under a field or beside a button. Both are announced to screen readers when they appear.
function FormError({
  message,
  variant = "banner",
  className,
  ...props
}: Omit<React.ComponentProps<"p">, "children"> & {
  message: string | null | undefined
  variant?: "banner" | "inline"
}) {
  if (!message) return null

  return (
    <p
      data-slot="form-error"
      role="alert"
      className={cn(
        variant === "banner"
          ? "border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
          : "text-[13px] text-destructive",
        className,
      )}
      {...props}
    >
      {message}
    </p>
  )
}

export { FormError }
