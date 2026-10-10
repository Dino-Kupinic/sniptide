"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@sniptide/ui/components/popover"
import { ChevronDownIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { createCollection } from "@/lib/collections/actions"
import { type Collection, defaultHue } from "@/lib/collections/types"
import { CollectionIcon } from "./icon"
import { IconOptions } from "./icon-picker"
import { CollectionNameDialog } from "./name-dialog"

// The "New collection" dialog. Its trigger lives with the caller (the sidebar's + button, the
// Collections page, a paste's "Add to collection" menu), so this only takes the open state. By
// default it opens the new collection; `onCreated` replaces that. `existing` is how many
// collections the viewer has, which picks the starting hue.
export function NewCollectionDialog({
  open,
  onOpenChange,
  existing,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: number
  onCreated?: (slug: string) => void
}) {
  const router = useRouter()
  const [look, setLook] = React.useState<Pick<Collection, "icon" | "hue">>({
    icon: "square",
    hue: defaultHue(existing),
  })

  // Every new collection starts from the default look.
  React.useEffect(() => {
    if (open) setLook({ icon: "square", hue: defaultHue(existing) })
  }, [open, existing])

  return (
    <CollectionNameDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New collection"
      description="Group related pastes under one name."
      submitLabel="Create collection"
      pendingLabel="Creating…"
      label="Name"
      placeholder="e.g. api-snippets"
      leading={
        <Popover>
          <PopoverTrigger
            aria-label="Choose an icon"
            className="flex h-10 shrink-0 items-center gap-1 border border-input px-2.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-primary"
          >
            <CollectionIcon icon={look.icon} hue={look.hue} className="size-3.5" />
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <IconOptions
              icon={look.icon}
              hue={look.hue}
              onPick={(next) => setLook((current) => ({ ...current, ...next }))}
            />
          </PopoverContent>
        </Popover>
      }
      onSubmit={async (name) => {
        const result = await createCollection(name, look)
        if (result.ok) {
          if (onCreated) onCreated(result.slug)
          else router.push(`/collections/${result.slug}`)
        }
        return result
      }}
    />
  )
}
