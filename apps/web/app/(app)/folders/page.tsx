import { FoldersView } from "@/components/folders/folders-view"
import { listFolders } from "@/lib/folders/store"

export const metadata = { title: "Folders · Sniptide" }

export default async function Page() {
  return <FoldersView folders={await listFolders()} />
}
