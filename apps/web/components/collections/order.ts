import { completeSidebarOrder, type SidebarState } from "@/components/shell/sidebar-state"
import type { Collection } from "@/lib/collections/types"

// The sidebar's collection order: the saved custom order, or by name when the sidebar sorts so.
export function orderCollections(collections: Collection[], sidebar: SidebarState) {
  const bySlug = new Map(collections.map((item) => [item.slug, item]))
  const slugs =
    sidebar.views.collections.sort === "name"
      ? [...collections]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
          .map((item) => item.slug)
      : completeSidebarOrder(
          sidebar.collectionOrder,
          collections.map((item) => item.slug),
        )
  return slugs.flatMap((slug) => bySlug.get(slug) ?? [])
}
