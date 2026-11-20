import { TrashListLoading } from "@/components/lists/list-loading"
import { LoadingScreen } from "@/components/loading/status"

export default function Loading() {
  return (
    <LoadingScreen>
      <TrashListLoading />
    </LoadingScreen>
  )
}
