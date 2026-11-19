import { CollectionsLoading } from "@/components/collections/collections-view"
import { LoadingScreen } from "@/components/loading/status"

export default function Loading() {
  return (
    <LoadingScreen>
      <CollectionsLoading />
    </LoadingScreen>
  )
}
