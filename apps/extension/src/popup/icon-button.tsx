import { Button } from "@sniptide/ui/components/button"
import type { ComponentProps } from "react"

// An icon-only ghost button. The label is its accessible name and its hover title.
export function IconButton({
  label,
  ...props
}: { label: string } & Omit<ComponentProps<typeof Button>, "aria-label" | "title">) {
  return <Button variant="ghost" size="icon" aria-label={label} title={label} {...props} />
}
