import { getTranslations } from "next-intl/server"
import { FoldersView } from "@/components/folders/folders-view"
import { listFolders } from "@/lib/folders/store"

export async function generateMetadata() {
  const t = await getTranslations("Core")
  return { title: `${t("folders")} · Sniptide` }
}

export default async function Page() {
  return <FoldersView folders={await listFolders()} />
}
