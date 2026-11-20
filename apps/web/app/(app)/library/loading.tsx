import { LibraryLoading } from "@/components/library/library-view"
import { LoadingScreen } from "@/components/loading/status"

export default function Loading() {
  return (
    <LoadingScreen>
      <LibraryLoading />
    </LoadingScreen>
  )
}
