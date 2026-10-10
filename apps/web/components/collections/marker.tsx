import { cn } from "@sniptide/ui/lib/utils"
import type { Marker } from "@/lib/collections/types"

const markerClass: Record<Marker, string> = {
  "filled-primary": "bg-primary",
  "filled-foreground": "bg-foreground",
  "outline-primary": "border-2 border-primary",
  "outline-foreground": "border-2 border-foreground",
}

// The small square beside a collection's name.
export function CollectionMarker({ marker, className }: { marker: Marker; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("size-2 shrink-0", markerClass[marker], className)} />
  )
}
