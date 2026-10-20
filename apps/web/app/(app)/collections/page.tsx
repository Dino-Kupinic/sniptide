import { getTranslations } from "next-intl/server"
import { CollectionsView } from "@/components/collections/collections-view"
import { listCollections } from "@/lib/collections/store"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("collections")} · Sniptide` }
}

export default async function Page() {
  return <CollectionsView collections={await listCollections()} />
}
