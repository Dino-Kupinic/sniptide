import { FormError } from "@sniptide/ui/components/form-error"
import { SuccessCheck } from "@sniptide/ui/components/success-check"
import { cn } from "@sniptide/ui/lib/utils"
import type * as React from "react"

// Two-column settings row from the Paper Settings artboard: title and description on the left,
// controls on the right. Stacks on phones.
// `repeatsHeading` hides the title on phones (keeping it for screen readers) where the section's
// screen already carries the same name in its h1.
export function SettingsSection({
  title,
  description,
  repeatsHeading = false,
  children,
}: {
  title: string
  description?: string
  repeatsHeading?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 border-t border-border py-6 first:border-t-0 lg:flex-row lg:gap-10 lg:py-7",
        // The screen's h1 sits right above, so the first section starts without a gap.
        repeatsHeading && "max-lg:first:pt-0",
      )}
    >
      {/* With the title hidden and no description, the block leaves the layout on phones so it
          adds no gap above the controls. */}
      <div
        className={cn(
          "flex flex-col gap-1 lg:w-[288px] lg:shrink-0",
          repeatsHeading && !description && "max-lg:contents",
        )}
      >
        <h2 className={cn("text-base font-semibold", repeatsHeading && "max-lg:sr-only")}>
          {title}
        </h2>
        {description ? (
          <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-5 lg:max-w-[560px]">{children}</div>
    </section>
  )
}

// A label beside its control. `wide` is for controls wider than a switch (segmented controls,
// selects): below sm they move under the label and take the full width.
export function SettingRow({
  label,
  description,
  id,
  wide = false,
  children,
}: {
  label: string
  description?: string
  id: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        wide && "max-sm:flex-col max-sm:items-stretch max-sm:gap-2",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        {description ? (
          <span className="text-[13px] text-muted-foreground">{description}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function SaveStatus({ status }: { status: { ok: boolean; message: string } | null }) {
  if (!status) return null
  if (!status.ok) return <FormError variant="inline" message={status.message} />
  return (
    <p role="status" className="flex items-center gap-1.5 text-[13px] text-link">
      <SuccessCheck className="size-3.5" />
      {status.message}
    </p>
  )
}
