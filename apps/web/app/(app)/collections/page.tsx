import { CollectionsView } from "@/components/collections/collections-view"
import { listCollections } from "@/lib/collections/store"

export const metadata = { title: "Collections · Sniptide" }

export default async function Page() {
  return <CollectionsView collections={await listCollections()} />
}
