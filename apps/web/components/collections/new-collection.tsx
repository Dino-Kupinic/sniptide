"use client"

import { Button } from "@sniptide/ui/components/button"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as React from "react"
import { createCollection } from "@/lib/collections/actions"
import { type Collection, defaultHue } from "@/lib/collections/types"
import { CollectionLookPicker } from "./icon-picker"
import { CollectionNameDialog } from "./name-dialog"

export function NewCollectionButton({ existing }: { existing: number }) {
  const t = useTranslations("Workspace")
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("new_collection")}
      </Button>
      <NewCollectionDialog open={open} onOpenChange={setOpen} existing={existing} />
    </>
  )
}

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
  const t = useTranslations("Workspace")
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
      title={t("new_collection")}
      description={t("group_related_pastes_under_one_name")}
      submitLabel={t("create_collection")}
      pendingLabel={t("creating")}
      label={t("name")}
      placeholder={t("eg_apisnippets")}
      leading={
        <CollectionLookPicker
          icon={look.icon}
          hue={look.hue}
          onPick={(next) => setLook((current) => ({ ...current, ...next }))}
        />
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
