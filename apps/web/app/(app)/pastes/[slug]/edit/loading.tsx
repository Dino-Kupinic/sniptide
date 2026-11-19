import { EditorLoading } from "@/components/loading/page-loading"
import { LoadingScreen } from "@/components/loading/status"

export default function Loading() {
  return (
    <LoadingScreen>
      <EditorLoading editing />
    </LoadingScreen>
  )
}
